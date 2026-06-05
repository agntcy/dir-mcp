// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"github.com/agntcy/oasf-sdk/pkg/schema"
)

// getSchemaInstance returns a lazily-initialized Schema instance using the
// SchemaURL configured on the Tools struct. The instance is created on first
// use and cached for subsequent calls. The schema URL is resolved once at
// server startup (see server.Serve) and remains immutable for the process
// lifetime.
func (t *Tools) getSchemaInstance() (*schema.Schema, error) {
	t.schemaMu.Lock()
	defer t.schemaMu.Unlock()

	if t.SchemaURL == "" {
		return nil, fmt.Errorf("schema URL is not configured")
	}

	if t.schemaInstance != nil {
		return t.schemaInstance, nil
	}

	inst, err := schema.New(t.SchemaURL, schema.WithCache(true))
	if err != nil {
		return nil, fmt.Errorf("failed to create schema instance: %w", err)
	}

	t.schemaInstance = inst

	return t.schemaInstance, nil
}

// validateVersion checks if the provided version is valid and returns available versions.
func (t *Tools) validateVersion(ctx context.Context, version string) ([]string, error) {
	schemaInstance, err := t.getSchemaInstance()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize schema client: %w", err)
	}

	availableVersions, err := schemaInstance.GetAvailableSchemaVersions(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get available schema versions: %w", err)
	}

	if version == "" {
		return availableVersions, fmt.Errorf("version parameter is required. Available versions: %s",
			strings.Join(availableVersions, ", "))
	}

	versionValid := slices.Contains(availableVersions, version)

	if !versionValid {
		return availableVersions, fmt.Errorf("invalid version '%s'. Available versions: %s",
			version, strings.Join(availableVersions, ", "))
	}

	return availableVersions, nil
}

// findTaxonomyItemByName returns the taxonomy node matching a parent name.
// It supports matching either the map key or the item's name field.
func findTaxonomyItemByName(taxonomy schema.Taxonomy, parent string) (schema.TaxonomyItem, bool) {
	for key, item := range taxonomy {
		if key == parent || item.Name == parent {
			return item, true
		}

		if len(item.Classes) > 0 {
			if found, ok := findTaxonomyItemByName(schema.Taxonomy(item.Classes), parent); ok {
				return found, true
			}
		}
	}

	return schema.TaxonomyItem{}, false
}
