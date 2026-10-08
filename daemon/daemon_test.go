// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

package daemon

import (
	"context"
	"net"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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

func TestStartReusesRunningServer(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	defer l.Close()

	t.Setenv("DIRECTORY_CLIENT_SERVER_ADDRESS", l.Addr().String())

	d, err := Start(context.Background())
	require.NoError(t, err)
	assert.Nil(t, d)
}

func TestStopNil(t *testing.T) {
	var d *Daemon

	d.Stop()
}
