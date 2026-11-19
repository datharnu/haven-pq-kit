// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PqAuth} from "../src/PqAuth.sol";
import {PqQuorum} from "../src/PqQuorum.sol";
import {VendorSig} from "../src/VendorSig.sol";

contract VectorsTest is Test {
    function test_authMessageMatchesTypescript() public view {
        string memory json = vm.readFile("vectors/messages.json");
        bytes memory got = PqAuth.encodeMessage(
            vm.parseJsonUint(json, ".auth.chainId"),
            vm.parseJsonAddress(json, ".auth.contract"),
            vm.parseJsonAddress(json, ".auth.signer"),
            vm.parseJsonBytes32(json, ".auth.action"),
            vm.parseJsonUint(json, ".auth.nonce"),
            vm.parseJsonUint(json, ".auth.deadline"),
            vm.parseJsonBytes32(json, ".auth.argsHash")
        );
        assertEq(got, vm.parseJsonBytes(json, ".auth.message"));
    }

    function test_quorumDomainsMatchTypescript() public view {
        string memory json = vm.readFile("vectors/messages.json");
        bytes32 action = vm.parseJsonBytes32(json, ".action");
        assertEq(PqQuorum.quorumAction(action), vm.parseJsonBytes32(json, ".quorumAction"));
        assertEq(PqQuorum.anyAction(action), vm.parseJsonBytes32(json, ".anyAction"));
    }

    function test_setMembersArgsHashMatchesTypescript() public view {
        string memory json = vm.readFile("vectors/messages.json");
        address[] memory members = vm.parseJsonAddressArray(json, ".setMembers.members");
        uint8 threshold = uint8(vm.parseJsonUint(json, ".setMembers.threshold"));
        assertEq(keccak256(abi.encode(members, threshold)), vm.parseJsonBytes32(json, ".setMembers.argsHash"));
    }

    function test_invoiceMessageMatchesTypescript() public view {
        string memory json = vm.readFile("vectors/messages.json");
        VendorSig.Invoice memory invoice = VendorSig.Invoice({
            vendor: vm.parseJsonAddress(json, ".invoice.vendor"),
            payee: vm.parseJsonAddress(json, ".invoice.payee"),
            token: vm.parseJsonAddress(json, ".invoice.token"),
            amount: vm.parseJsonUint(json, ".invoice.amount"),
            invoiceId: vm.parseJsonBytes32(json, ".invoice.invoiceId"),
            dueDate: vm.parseJsonUint(json, ".invoice.dueDate"),
            memoHash: vm.parseJsonBytes32(json, ".invoice.memoHash")
        });
        bytes memory got = VendorSig.encode(vm.parseJsonUint(json, ".invoice.chainId"), vm.parseJsonAddress(json, ".invoice.gate"), invoice);
        assertEq(got, vm.parseJsonBytes(json, ".invoice.message"));
    }
}
