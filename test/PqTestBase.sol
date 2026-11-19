// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PqAuth} from "../src/PqAuth.sol";
import {MockQorePQC, PqcMockConfig} from "./mocks/MockQorePQC.sol";
import {PqTestKeys} from "./PqTestKeys.sol";

contract PqTestBase is Test {
    PqcMockConfig internal config;

    function setUp() public virtual {
        config = new PqcMockConfig();
        MockQorePQC impl = new MockQorePQC(config);
        vm.etch(PqAuth.PQC_VERIFY, address(impl).code);
        vm.etch(PqAuth.PQC_STATUS, address(impl).code);
        vm.warp(1_700_000_000);
    }

    function _pubkey(address account) internal pure returns (bytes memory) {
        return PqTestKeys.pubkey(account);
    }

    function _secret(address account) internal pure returns (bytes32) {
        return PqTestKeys.secret(account);
    }

    function _register(address account) internal {
        config.setKey(account, PqAuth.ML_DSA_87, _pubkey(account), true, _secret(account));
    }

    function _sign(address account, bytes memory message) internal pure returns (bytes memory) {
        return PqTestKeys.sign(account, message);
    }
}
