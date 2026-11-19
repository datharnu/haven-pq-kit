// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {PqAuth} from "../src/PqAuth.sol";

/// @notice Mock keys for the etched precompile. A keyed hash with ML-DSA-87's byte lengths, not ML-DSA.
library PqTestKeys {
    function pubkey(address account) internal pure returns (bytes memory key) {
        key = new bytes(PqAuth.PUBKEY_LEN);
        key[32] = 0x01;
        bytes20 raw = bytes20(account);
        for (uint256 i = 0; i < 20; i++) {
            key[i] = raw[i];
        }
    }

    function secret(address account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("haven-test-secret", account));
    }

    function sign(address account, bytes memory message) internal pure returns (bytes memory signature) {
        signature = new bytes(PqAuth.SIG_LEN);
        bytes32 mac = keccak256(abi.encode(secret(account), keccak256(message)));
        assembly {
            mstore(add(signature, 32), mac)
        }
    }
}
