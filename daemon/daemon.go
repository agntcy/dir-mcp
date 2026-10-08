// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

// Package daemon starts a local Directory daemon (`dirctl daemon start`, run in-process) next
// to the MCP server, so the tools have a Directory node to talk to without any
// manual setup.
package daemon

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	dirdaemon "github.com/agntcy/dir/cli/cmd/daemon"
	"github.com/agntcy/dir/client"
)

const (
	// EnvDisable turns off the automatic daemon when set to "false", "0" or "off".
	EnvDisable = "DIR_MCP_DAEMON"

	startTimeout = 60 * time.Second

	// portFreeTimeout is how long Start waits for a previous server (for
	// example a dir-mcp that is still shutting down after a host restart) to
	// release the address before giving up.
	portFreeTimeout = 30 * time.Second
	stopTimeout     = 15 * time.Second
	pollInterval    = 250 * time.Millisecond
	dialTimeout     = 500 * time.Millisecond
)

// ErrAddressInUse is returned by Start when another server keeps holding the
// configured Directory address.
var ErrAddressInUse = errors.New("directory server address is already in use")

// Daemon is a Directory daemon running in this process.
type Daemon struct {
	cancel context.CancelFunc
	done   chan struct{}
}

var errLockHeld = errors.New("instance lock held by another process")

// Start launches a local Directory daemon when one is needed and returns it.
// It returns (nil, nil) when nothing was started: the feature is disabled or
// the configured server is not local. If another server holds the address,
// Start waits up to 30 seconds for it (and its locks) to go away and then fails
// with ErrAddressInUse. The caller must Stop a non-nil Daemon.
//
// The daemon is the dirctl `daemon start` command, run in-process. It logs to
// os.Stdout, so callers that use stdout for a protocol stream must point
// os.Stdout elsewhere before calling Start.
func Start(ctx context.Context) (*Daemon, error) {
	if isDisabled(os.Getenv(EnvDisable)) {
		return nil, nil //nolint:nilnil // nothing to start
	}

	cfg, err := client.LoadConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to load client configuration: %w", err)
	}

	addr := dialAddress(cfg.ServerAddress)
	if !isLocal(addr) {
		return nil, nil //nolint:nilnil // remote server, nothing to start
	}

	// A previous dir-mcp (for example one the host is restarting) may still be
	// shutting down; its port frees before its database locks do. An instance
	// lock held for the process lifetime makes this one wait until the old
	// process is fully gone, and tells another running dir-mcp apart from a
	// dirctl daemon.
	deadline := time.Now().Add(portFreeTimeout)

	release, err := acquireInstanceLock(ctx, deadline)
	if err != nil {
		return nil, err
	}

	if err := waitPortFree(ctx, addr, cfg.ServerAddress, deadline); err != nil {
		release()

		return nil, err
	}

	d, err := startOnce(ctx, addr, cfg.ServerAddress)
	if err != nil {
		release()

		return nil, err
	}

	// The instance lock is deliberately never released here: the daemon can
	// leave its database locks held until the process exits, so only process
	// exit (which drops the flock) may let the next dir-mcp start.
	_ = release

	return d, nil
}

// acquireInstanceLock waits until no other dir-mcp holds the instance lock.
func acquireInstanceLock(ctx context.Context, deadline time.Time) (func(), error) {
	home, err := os.UserHomeDir()
	if err != nil {
		home = os.TempDir()
	}

	dir := filepath.Join(home, ".agntcy", "dir")
	if err := os.MkdirAll(dir, 0o700); err != nil { //nolint:mnd
		return nil, fmt.Errorf("failed to create data directory %s: %w", dir, err)
	}

	path := filepath.Join(dir, "dir-mcp.lock")
	waited := false

	for {
		release, err := tryLock(path)
		if err == nil {
			return release, nil
		}

		if !errors.Is(err, errLockHeld) {
			return nil, err
		}

		if !waited {
			log.Printf("dir-mcp: another dir-mcp is running, waiting up to %s for it to exit", portFreeTimeout)

			waited = true
		}

		if !time.Now().Before(deadline) {
			return nil, fmt.Errorf("%w: another dir-mcp server is still running after %s; "+
				"close it (for example the other editor or MCP host using it) and try again", ErrAddressInUse, portFreeTimeout)
		}

		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("daemon start cancelled: %w", ctx.Err())
		case <-time.After(pollInterval):
		}
	}
}

// startOnce runs one daemon attempt and waits for it to become ready.
func startOnce(ctx context.Context, addr, display string) (*Daemon, error) {
	runCtx, cancel := context.WithCancel(ctx)
	d := &Daemon{cancel: cancel, done: make(chan struct{})}
	errCh := make(chan error, 1)

	go func() {
		defer close(d.done)

		dirdaemon.Command.SetArgs([]string{"start"})
		dirdaemon.Command.SetOut(os.Stderr)
		dirdaemon.Command.SetErr(os.Stderr)

		errCh <- dirdaemon.Command.ExecuteContext(runCtx)
	}()

	log.Printf("dir-mcp: starting Directory daemon, waiting for %s", display)

	if err := d.waitReady(ctx, addr, errCh); err != nil {
		d.Stop()

		return nil, err
	}

	log.Printf("dir-mcp: Directory daemon ready on %s", display)

	return d, nil
}

// Stop shuts the daemon down and waits for it to exit. Safe on a nil Daemon.
func (d *Daemon) Stop() {
	if d == nil {
		return
	}

	d.cancel()

	select {
	case <-d.done:
	case <-time.After(stopTimeout):
		log.Printf("dir-mcp: Directory daemon did not stop within %s", stopTimeout)
	}
}

func (d *Daemon) waitReady(ctx context.Context, addr string, errCh <-chan error) error {
	waitCtx, cancel := context.WithTimeout(ctx, startTimeout)
	defer cancel()

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case err := <-errCh:
			if err == nil {
				err = errors.New("daemon exited")
			}

			return fmt.Errorf("directory daemon failed before becoming ready: %w", err)
		case <-waitCtx.Done():
			return fmt.Errorf("directory daemon not ready on %s: %w", addr, waitCtx.Err())
		case <-ticker.C:
			if reachable(ctx, addr) {
				return nil
			}
		}
	}
}

// waitPortFree waits until nothing listens on addr. A previous dir-mcp that is
// still shutting down releases it within seconds; anything longer means a
// different long-running server (another dir-mcp, or a dirctl daemon).
func waitPortFree(ctx context.Context, addr, display string, deadline time.Time) error {
	if !reachable(ctx, addr) {
		return nil
	}

	log.Printf("dir-mcp: %s is in use, waiting for it to be released", display)

	waitCtx, cancel := context.WithDeadline(ctx, deadline)
	defer cancel()

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-waitCtx.Done():
			return fmt.Errorf("%w: %s is still held after %s, most likely by another dir-mcp or a running Directory daemon; "+
				"stop it, or set %s=false to use the running server", ErrAddressInUse, display, portFreeTimeout, EnvDisable)
		case <-ticker.C:
			if !reachable(ctx, addr) {
				return nil
			}
		}
	}
}

func reachable(ctx context.Context, addr string) bool {
	dialer := net.Dialer{Timeout: dialTimeout}

	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return false
	}

	_ = conn.Close()

	return true
}

// dialAddress maps a wildcard bind address (the client default 0.0.0.0:8888)
// to loopback so it can be dialed.
func dialAddress(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}

	if ip := net.ParseIP(host); host == "" || (ip != nil && ip.IsUnspecified()) {
		host = "127.0.0.1"
	}

	return net.JoinHostPort(host, port)
}

func isLocal(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}

	if host == "localhost" {
		return true
	}

	ip := net.ParseIP(host)

	return ip != nil && ip.IsLoopback()
}

func isDisabled(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "false", "0", "off", "no":
		return true
	default:
		return false
	}
}
