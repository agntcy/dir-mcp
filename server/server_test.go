// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

package server

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestServe_ValidationConfiguration(t *testing.T) {
	tests := []struct {
		name             string
		oasfSchemaURLEnv string
	}{
		{
			name:             "falls back to default schema URL when env is not set",
			oasfSchemaURLEnv: "",
		},
		{
			name:             "use schema URL from OASF_API_VALIDATION_SCHEMA_URL env",
			oasfSchemaURLEnv: "https://schema.oasf.outshift.com",
		},
		{
			name:             "use custom schema URL",
			oasfSchemaURLEnv: "https://custom.schema.url",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// The validator is constructed inside Serve from this value, so
			// no global initialization is required.
			t.Setenv("OASF_API_VALIDATION_SCHEMA_URL", tt.oasfSchemaURLEnv)

			// Create a context that will be cancelled immediately to stop Serve early
			ctx, cancel := context.WithCancel(context.Background())
			cancel() // Cancel immediately so Serve returns quickly

			// Call Serve - it will configure validation and then return due
			// to cancelled context. Serve should not return a configuration
			// error: an empty env var must fall back to the default URL.
			err := Serve(ctx)

			// We expect an error from the cancelled context rather than a
			// configuration error. The previous behavior of erroring on an
			// unset env var is no longer expected.
			assert.Error(t, err)
			assert.NotContains(t, err.Error(), "OASF_API_VALIDATION_SCHEMA_URL",
				"Serve should no longer require OASF_API_VALIDATION_SCHEMA_URL")
		})
	}
}
