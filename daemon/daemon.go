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
	"strings"
	"time"

	dirdaemon "github.com/agntcy/dir/cli/cmd/daemon"
	"github.com/agntcy/dir/client"
)

const (
	// EnvDisable turns off the automatic daemon when set to "false", "0" or "off".
	EnvDisable = "DIR_MCP_DAEMON"

	startTimeout = 60 * time.Second
	stopTimeout  = 15 * time.Second
	pollInterval = 250 * time.Millisecond
	dialTimeout  = 500 * time.Millisecond
)

// Daemon is a Directory daemon running in this process.
type Daemon struct {
	cancel context.CancelFunc
	done   chan struct{}
}

// Start launches a local Directory daemon when one is needed and returns it.
// It returns (nil, nil) when nothing was started: the feature is disabled, the
// configured server is not local, or a server already listens on its address.
// The caller must Stop a non-nil Daemon.
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

	if reachable(addr) {
		log.Printf("dir-mcp: Directory server already listening on %s, not starting daemon", cfg.ServerAddress)

		return nil, nil //nolint:nilnil // reuse the running server
	}

	runCtx, cancel := context.WithCancel(ctx)
	d := &Daemon{cancel: cancel, done: make(chan struct{})}
	errCh := make(chan error, 1)

	go func() {
		defer close(d.done)

		// The command is a package-level singleton; Start runs at most once.
		dirdaemon.Command.SetArgs([]string{"start"})
		dirdaemon.Command.SetOut(os.Stderr)
		dirdaemon.Command.SetErr(os.Stderr)

		errCh <- dirdaemon.Command.ExecuteContext(runCtx)
	}()

	log.Printf("dir-mcp: starting Directory daemon, waiting for %s", cfg.ServerAddress)

	if err := d.waitReady(ctx, addr, errCh); err != nil {
		d.Stop()

		return nil, err
	}

	log.Printf("dir-mcp: Directory daemon ready on %s", cfg.ServerAddress)

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
	ctx, cancel := context.WithTimeout(ctx, startTimeout)
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
		case <-ctx.Done():
			return fmt.Errorf("directory daemon not ready on %s: %w", addr, ctx.Err())
		case <-ticker.C:
			if reachable(addr) {
				return nil
			}
		}
	}
}

func reachable(addr string) bool {
	conn, err := net.DialTimeout("tcp", addr, dialTimeout)
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
