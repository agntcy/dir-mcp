// Copyright AGNTCY Contributors (https://github.com/agntcy)
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"context"
	"fmt"

	identityv1 "github.com/agntcy/dir/api/identity/v1"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// VerifyNameInput defines the input parameters for verifying a record's identity.
type VerifyNameInput struct {
	CID     string `json:"cid,omitempty"     jsonschema:"Content Identifier (CID) of the record to verify"`
	Name    string `json:"name,omitempty"    jsonschema:"Human-readable name of the record (e.g., 'example.com/my-agent')"`
	Version string `json:"version,omitempty" jsonschema:"Optional version to verify (e.g., 'v1.0.0'). If omitted, verifies the latest version."`
}

// ClaimVerificationDetail provides details about the verification of an identity or ownership claim.
type ClaimVerificationDetail struct {
	Subject    string `json:"subject,omitempty"     jsonschema:"The identity or owner the claim asserts"`
	Status     string `json:"status"                jsonschema:"Verification status of the claim (verified, failed or unverified)"`
	Error      string `json:"error,omitempty"       jsonschema:"Reason the verification failed"`
	VerifiedAt string `json:"verified_at,omitempty" jsonschema:"Timestamp when verification occurred"`
}

// VerifyNameOutput defines the output of name verification.
type VerifyNameOutput struct {
	CID          string                   `json:"cid,omitempty"           jsonschema:"CID of the record that was checked"`
	Verified     bool                     `json:"verified"                jsonschema:"Whether the record's identity claim was verified"`
	Identity     *ClaimVerificationDetail `json:"identity,omitempty"      jsonschema:"Verification result of the record's identity claim"`
	Owner        *ClaimVerificationDetail `json:"owner,omitempty"         jsonschema:"Verification result of the record's ownership claim"`
	ErrorMessage string                   `json:"error_message,omitempty" jsonschema:"Error message if verification failed"`
}

// VerifyName reports the verification status of a record's identity and ownership claims.
// A record can be looked up by CID, or by name and optional version, which is resolved to
// the newest matching record.
func (t *Tools) VerifyName(ctx context.Context, _ *mcp.CallToolRequest, input VerifyNameInput) (
	*mcp.CallToolResult,
	VerifyNameOutput,
	error,
) {
	// Validate input - need either CID or Name
	if input.CID == "" && input.Name == "" {
		return nil, VerifyNameOutput{
			ErrorMessage: "Either 'cid' or 'name' is required",
		}, nil
	}

	cid := input.CID

	if cid == "" {
		// Resolve name (and optional version) to a CID; results are newest first
		resolved, err := t.Client.Resolve(ctx, input.Name, input.Version)
		if err != nil {
			return nil, VerifyNameOutput{
				ErrorMessage: fmt.Sprintf("Failed to verify name: %v", err),
			}, nil
		}

		if len(resolved.GetRecords()) == 0 {
			return nil, VerifyNameOutput{
				ErrorMessage: fmt.Sprintf("No record found for name %q", input.Name),
			}, nil
		}

		cid = resolved.GetRecords()[0].GetCid()
	}

	resp, err := t.Client.GetIdentityStatus(ctx, cid)
	if err != nil {
		return nil, VerifyNameOutput{
			CID:          cid,
			ErrorMessage: fmt.Sprintf("Failed to verify name: %v", err),
		}, nil
	}

	output := VerifyNameOutput{
		CID:      cid,
		Identity: claimDetail(resp.GetIdentity()),
		Owner:    claimDetail(resp.GetOwner()),
	}

	output.Verified = resp.GetIdentity().GetStatus() == identityv1.ClaimVerificationStatus_CLAIM_VERIFICATION_STATUS_VERIFIED

	if !output.Verified {
		switch {
		case resp.GetIdentity() == nil:
			output.ErrorMessage = "Identity claim has not been verified yet"
		case resp.GetIdentity().GetError() != "":
			output.ErrorMessage = resp.GetIdentity().GetError()
		}
	}

	return nil, output, nil
}

// claimDetail converts a claim verification result to its tool output form.
// A claim with no result yet is nil.
func claimDetail(v *identityv1.ClaimVerification) *ClaimVerificationDetail {
	if v == nil {
		return nil
	}

	detail := &ClaimVerificationDetail{
		Subject: v.GetSubject(),
		Status:  claimStatus(v.GetStatus()),
		Error:   v.GetError(),
	}

	if v.GetVerifiedAt() != nil {
		detail.VerifiedAt = v.GetVerifiedAt().AsTime().String()
	}

	return detail
}

func claimStatus(s identityv1.ClaimVerificationStatus) string {
	switch s {
	case identityv1.ClaimVerificationStatus_CLAIM_VERIFICATION_STATUS_VERIFIED:
		return "verified"
	case identityv1.ClaimVerificationStatus_CLAIM_VERIFICATION_STATUS_FAILED:
		return "failed"
	case identityv1.ClaimVerificationStatus_CLAIM_VERIFICATION_STATUS_UNSPECIFIED:
		return "unverified"
	default:
		return "unverified"
	}
}
