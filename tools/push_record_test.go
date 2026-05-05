// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPushRecord(t *testing.T) {
	// Tools without a Client/Validator: tests below only exercise the JSON
	// parsing path, which fails before validation or transport is reached.
	tools := &Tools{Client: nil}

	tests := []struct {
		name           string
		input          PushRecordInput
		wantError      bool
		wantErrorMsg   string
		validateOutput func(t *testing.T, output PushRecordOutput)
	}{
		{
			name: "invalid JSON",
			input: PushRecordInput{
				RecordJSON: "invalid json",
			},
			wantError:    true,
			wantErrorMsg: "Failed to parse record JSON",
		},
		{
			name: "empty JSON",
			input: PushRecordInput{
				RecordJSON: "{}",
			},
			wantError:    true,
			wantErrorMsg: "Failed to parse record JSON",
		},
		{
			name: "valid but invalid record structure",
			input: PushRecordInput{
				RecordJSON: `{"invalid": "structure"}`,
			},
			wantError:    true,
			wantErrorMsg: "Failed to parse record JSON",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			req := &mcp.CallToolRequest{}

			_, output, err := tools.PushRecord(ctx, req, tt.input)

			if tt.wantError {
				require.NoError(t, err) // PushRecord returns nil error, error in output
				// result can be nil when there's an error - error info is in output.ErrorMessage
				assert.Contains(t, output.ErrorMessage, tt.wantErrorMsg)
				assert.Empty(t, output.CID)
			} else {
				if err != nil {
					t.Errorf("PushRecord() unexpected error: %v", err)
				}

				if tt.validateOutput != nil {
					tt.validateOutput(t, output)
				}
			}
		})
	}
}

func TestPushRecord_InvalidRecord(t *testing.T) {
	// Inject a fake validator that reports the record as invalid so the
	// PushRecord handler exercises its "Record validation failed" path
	// without requiring a live OASF schema endpoint.
	tools := &Tools{
		Client: nil,
		Validator: &fakeValidator{
			valid:  false,
			errors: []string{"missing required field 'version'"},
		},
	}

	// Record that parses successfully but will be rejected by the validator.
	invalidRecordJSON := `{
		"schema_version": "0.7.0",
		"name": "test-agent"
	}`

	ctx := context.Background()
	req := &mcp.CallToolRequest{}

	_, output, err := tools.PushRecord(ctx, req, PushRecordInput{
		RecordJSON: invalidRecordJSON,
	})

	require.NoError(t, err) // PushRecord returns nil error, error in output
	assert.NotEmpty(t, output.ErrorMessage)
	assert.Contains(t, output.ErrorMessage, "validation")
	assert.Empty(t, output.CID)
}
