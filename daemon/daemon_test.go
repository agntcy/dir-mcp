// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

package daemon

import (
	"context"
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func listenLocal() (net.Listener, error) {
	var lc net.ListenConfig

	l, err := lc.Listen(context.Background(), "tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen: %w", err)
	}

	return l, nil
}

func TestDialAddress(t *testing.T) {
	assert.Equal(t, "127.0.0.1:8888", dialAddress("0.0.0.0:8888"))
	assert.Equal(t, "127.0.0.1:8888", dialAddress(":8888"))
	assert.Equal(t, "localhost:9000", dialAddress("localhost:9000"))
	assert.Equal(t, "dir.example.com:443", dialAddress("dir.example.com:443"))
}

func TestIsLocal(t *testing.T) {
	assert.True(t, isLocal("127.0.0.1:8888"))
	assert.True(t, isLocal("localhost:8888"))
	assert.True(t, isLocal("[::1]:8888"))
	assert.False(t, isLocal("dir.example.com:443"))
	assert.False(t, isLocal("10.0.0.5:8888"))
}

func TestIsDisabled(t *testing.T) {
	assert.True(t, isDisabled("false"))
	assert.True(t, isDisabled(" OFF "))
	assert.False(t, isDisabled(""))
	assert.False(t, isDisabled("true"))
}

func TestStartDisabled(t *testing.T) {
	t.Setenv(EnvDisable, "false")

	d, err := Start(context.Background())
	require.NoError(t, err)
	assert.Nil(t, d)
}

func TestStartRemoteServer(t *testing.T) {
	t.Setenv("DIRECTORY_CLIENT_SERVER_ADDRESS", "dir.example.com:443")

	d, err := Start(context.Background())
	require.NoError(t, err)
	assert.Nil(t, d)
}

func TestWaitPortFreeReleased(t *testing.T) {
	l, err := listenLocal()
	require.NoError(t, err)

	addr := l.Addr().String()

	go func() {
		time.Sleep(600 * time.Millisecond)
		l.Close()
	}()

	require.NoError(t, waitPortFree(context.Background(), addr, addr, time.Now().Add(5*time.Second)))
}

func TestWaitPortFreeTimeout(t *testing.T) {
	l, err := listenLocal()
	require.NoError(t, err)

	defer l.Close()

	err = waitPortFree(context.Background(), l.Addr().String(), l.Addr().String(), time.Now().Add(time.Second))
	require.ErrorIs(t, err, ErrAddressInUse)
}

func TestStopNil(t *testing.T) {
	var d *Daemon

	d.Stop()
}
