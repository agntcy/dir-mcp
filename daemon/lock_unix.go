// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

//go:build unix

package daemon

import (
	"errors"
	"fmt"
	"os"
	"syscall"
)

// tryLock takes a non-blocking exclusive lock on path. The OS drops it when
// the process exits, however it exits. It returns errLockHeld when another
// process holds it.
func tryLock(path string) (func(), error) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600) //nolint:mnd
	if err != nil {
		return nil, fmt.Errorf("failed to open lock file %s: %w", path, err)
	}

	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil { //nolint:gosec // fd fits in int
		_ = f.Close()

		if errors.Is(err, syscall.EWOULDBLOCK) {
			return nil, errLockHeld
		}

		return nil, fmt.Errorf("failed to lock %s: %w", path, err)
	}

	return func() { _ = f.Close() }, nil
}
