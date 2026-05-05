// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"context"
	"errors"
	"testing"

	corev1 "github.com/agntcy/dir/api/core/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/structpb"
)

// fakeValidator is a hermetic stand-in for the OASF validator that lets us
// assert ValidateRecord's behavior without hitting the network. It mirrors
// the corev1.Validator interface contract.
type fakeValidator struct {
	valid    bool
	errors   []string
	warnings []string
	err      error
}

func (f *fakeValidator) ValidateRecord(_ context.Context, _ *structpb.Struct) (bool, []string, []string, error) {
	return f.valid, f.errors, f.warnings, f.err
}

// Compile-time check that fakeValidator implements the interface.
var _ corev1.Validator = (*fakeValidator)(nil)

func TestValidateRecord(t *testing.T) {
	validRecord := `{
		"schema_version": "0.7.0",
		"name": "test-agent",
		"version": "1.0.0",
		"description": "A test agent",
		"authors": ["Test Author <test@example.com>"],
		"created_at": "2024-01-01T00:00:00Z",
		"locators": [
			{
				"type": "helm_chart",
				"url": "https://example.com/helm-chart.tgz"
			}
		],
		"skills": [
			{
				"name": "natural_language_processing/natural_language_understanding"
			}
		]
	}`

	t.Run("should validate a valid record", func(t *testing.T) {
		tools := &Tools{Client: nil, Validator: &fakeValidator{valid: true}}
		ctx := context.Background()
		input := ValidateRecordInput{RecordJSON: validRecord}

		_, output, err := tools.ValidateRecord(ctx, nil, input)

		require.NoError(t, err)
		assert.Empty(t, output.ErrorMessage)
		assert.True(t, output.Valid, "Record should be valid (warnings don't affect validity)")
		assert.Equal(t, "0.7.0", output.SchemaVersion)
		assert.Empty(t, output.ValidationErrors)
	})

	t.Run("should propagate warnings without invalidating the record", func(t *testing.T) {
		tools := &Tools{Client: nil, Validator: &fakeValidator{
			valid:    true,
			warnings: []string{"deprecated field used"},
		}}
		ctx := context.Background()
		input := ValidateRecordInput{RecordJSON: validRecord}

		_, output, err := tools.ValidateRecord(ctx, nil, input)

		require.NoError(t, err)
		assert.True(t, output.Valid)
		require.Len(t, output.ValidationErrors, 1)
		assert.Equal(t, "WARNING: deprecated field used", output.ValidationErrors[0])
	})

	t.Run("should reject invalid JSON", func(t *testing.T) {
		// Validator is intentionally nil: ValidateRecord must fail fast
		// before reaching schema validation when the JSON cannot be parsed.
		tools := &Tools{Client: nil}
		ctx := context.Background()
		input := ValidateRecordInput{RecordJSON: "not valid json"}

		_, output, err := tools.ValidateRecord(ctx, nil, input)

		require.NoError(t, err)
		assert.NotEmpty(t, output.ErrorMessage)
		assert.False(t, output.Valid)
		assert.Contains(t, output.ErrorMessage, "Failed to parse")
	})

	t.Run("should report schema validation errors", func(t *testing.T) {
		tools := &Tools{Client: nil, Validator: &fakeValidator{
			valid:  false,
			errors: []string{"missing required field 'authors'"},
		}}
		ctx := context.Background()
		input := ValidateRecordInput{RecordJSON: validRecord}

		_, output, err := tools.ValidateRecord(ctx, nil, input)

		require.NoError(t, err)
		assert.Empty(t, output.ErrorMessage)
		assert.False(t, output.Valid)
		require.Len(t, output.ValidationErrors, 1)
		assert.Equal(t, "ERROR: missing required field 'authors'", output.ValidationErrors[0])
	})

	t.Run("should surface validator transport errors", func(t *testing.T) {
		tools := &Tools{Client: nil, Validator: &fakeValidator{
			err: errors.New("schema endpoint unreachable"),
		}}
		ctx := context.Background()
		input := ValidateRecordInput{RecordJSON: validRecord}

		_, output, err := tools.ValidateRecord(ctx, nil, input)

		require.NoError(t, err)
		assert.False(t, output.Valid)
		assert.Equal(t, "0.7.0", output.SchemaVersion)
		assert.Contains(t, output.ErrorMessage, "Validation error")
		assert.Contains(t, output.ErrorMessage, "schema endpoint unreachable")
	})

	t.Run("should reject empty input", func(t *testing.T) {
		tools := &Tools{Client: nil}
		ctx := context.Background()
		input := ValidateRecordInput{RecordJSON: ""}

		_, output, err := tools.ValidateRecord(ctx, nil, input)

		require.NoError(t, err)
		assert.NotEmpty(t, output.ErrorMessage)
		assert.Contains(t, output.ErrorMessage, "Failed to parse")
	})
}
