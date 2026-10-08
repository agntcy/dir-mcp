// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

//go:build !unix

package daemon

// tryLock is a no-op where flock is unavailable; only the port check guards
// against a second instance there.
func tryLock(string) (func(), error) {
	return func() {}, nil
}
