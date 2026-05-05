// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"context"
	"fmt"

	corev1 "github.com/agntcy/dir/api/core/v1"
	"github.com/agntcy/dir/client"
)

// Tools provides Directory client-dependent tool implementations.
// Create with NewTools and use the methods as MCP tool handlers.
//
// Validator is required by tools that perform OASF schema validation
// (e.g. PushRecord, ValidateRecord). It is injected by the caller (the
// MCP server entrypoint) so that no process-wide singleton is needed
// and so that tests can supply fakes. See github.com/agntcy/dir issue #856.
type Tools struct {
	Client        *client.Client
	ServerAddress string
	Validator     corev1.Validator
}

// NewTools creates a new Tools instance with a Directory client and the
// provided OASF validator. The caller is responsible for calling Close()
// when done. The validator is owned by the caller; Close() does not
// touch it.
func NewTools(ctx context.Context, validator corev1.Validator) (*Tools, error) {
	config, err := client.LoadConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to load client configuration: %w", err)
	}

	c, err := client.New(ctx, client.WithConfig(config))
	if err != nil {
		return nil, fmt.Errorf("failed to create Directory client: %w", err)
	}

	return &Tools{
		Client:        c,
		ServerAddress: config.ServerAddress,
		Validator:     validator,
	}, nil
}

// Close releases the client resources.
func (t *Tools) Close() error {
	if t.Client != nil {
		if err := t.Client.Close(); err != nil {
			return fmt.Errorf("failed to close client: %w", err)
		}
	}

	return nil
}
