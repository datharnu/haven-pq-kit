// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {PqAuth} from "./PqAuth.sol";

/// @notice An ML-DSA-87 signature by a registered account over one invoice.
/// @dev Replay protection is the caller's job: store `invoiceId` after a successful check.
library VendorSig {
    bytes32 internal constant DOMAIN = keccak256("haven-pq-kit.VendorSig.v1");

    struct Invoice {
        address vendor;
        address payee;
        address token;
        uint256 amount;
        bytes32 invoiceId;
        uint256 dueDate;
        bytes32 memoHash;
    }

    error VendorZero();

    function encode(uint256 chainId, address gate, Invoice memory invoice) internal pure returns (bytes memory) {
        return abi.encode(
            DOMAIN,
            chainId,
            gate,
            invoice.vendor,
            invoice.payee,
            invoice.token,
            invoice.amount,
            invoice.invoiceId,
            invoice.dueDate,
            invoice.memoHash
        );
    }

    function verify(Invoice memory invoice, bytes calldata signature) internal view {
        if (invoice.vendor == address(0)) revert VendorZero();
        PqAuth.verify(invoice.vendor, encode(block.chainid, address(this), invoice), signature);
    }
}
