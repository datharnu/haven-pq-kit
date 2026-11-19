// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PqAuth} from "../src/PqAuth.sol";
import {MockQorePQC, PqcMockConfig} from "./mocks/MockQorePQC.sol";

contract PqTestBase is Test {
    PqcMockConfig internal config;

    function setUp() public virtual {
        config = new PqcMockConfig();
        MockQorePQC impl = new MockQorePQC(config);
        vm.etch(PqAuth.PQC_VERIFY, address(impl).code);
        vm.etch(PqAuth.PQC_STATUS, address(impl).code);
        vm.warp(1_700_000_000);
    }

    function _pubkey(address account) internal pure returns (bytes memory pubkey) {
        pubkey = new bytes(PqAuth.PUBKEY_LEN);
        pubkey[32] = 0x01;
        bytes20 raw = bytes20(account);
        for (uint256 i = 0; i < 20; i++) {
            pubkey[i] = raw[i];
        }
    }

    function _secret(address account) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("haven-test-secret", account));
    }

    function _register(address account) internal {
        config.setKey(account, PqAuth.ML_DSA_87, _pubkey(account), true, _secret(account));
    }

    function _sign(address account, bytes memory message) internal pure returns (bytes memory signature) {
        signature = new bytes(PqAuth.SIG_LEN);
        bytes32 mac = keccak256(abi.encode(_secret(account), keccak256(message)));
        assembly {
            mstore(add(signature, 32), mac)
        }
    }
}
