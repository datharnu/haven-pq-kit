// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {PqAuth} from "../src/PqAuth.sol";
import {VendorSig} from "../src/VendorSig.sol";
import {PqTestBase} from "./PqTestBase.sol";

contract VendorHarness {
    function verify(VendorSig.Invoice calldata invoice, bytes calldata signature) external view {
        VendorSig.verify(invoice, signature);
    }

    function message(VendorSig.Invoice calldata invoice) external view returns (bytes memory) {
        return VendorSig.encode(block.chainid, address(this), invoice);
    }
}

contract VendorSigTest is PqTestBase {
    VendorHarness internal harness;
    address internal vendor = address(0xE11A);
    address internal payee = address(0xB0B);

    function setUp() public override {
        super.setUp();
        harness = new VendorHarness();
        _register(vendor);
    }

    function _invoice(uint256 amount) internal view returns (VendorSig.Invoice memory invoice) {
        invoice = VendorSig.Invoice({
            vendor: vendor,
            payee: payee,
            token: address(0xF05D),
            amount: amount,
            invoiceId: keccak256("inv-1"),
            dueDate: block.timestamp + 7 days,
            memoHash: keccak256("memo")
        });
    }

    function test_verify_acceptsTheVendorsSignature() public view {
        VendorSig.Invoice memory invoice = _invoice(1_000_000);
        harness.verify(invoice, _sign(vendor, harness.message(invoice)));
    }

    function test_verify_rejectsATamperedAmount() public {
        VendorSig.Invoice memory invoice = _invoice(1_000_000);
        bytes memory signature = _sign(vendor, harness.message(invoice));
        invoice.amount = 2_000_000;
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.verify(invoice, signature);
    }

    function test_verify_rejectsAnotherGate() public {
        VendorSig.Invoice memory invoice = _invoice(1_000_000);
        bytes memory signature = _sign(vendor, harness.message(invoice));
        VendorHarness other = new VendorHarness();
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        other.verify(invoice, signature);
    }

    function test_verify_rejectsAnotherChain() public {
        VendorSig.Invoice memory invoice = _invoice(1_000_000);
        bytes memory signature = _sign(vendor, harness.message(invoice));
        vm.chainId(9801);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.verify(invoice, signature);
    }

    function test_verify_rejectsAnUnprovenVendor() public {
        config.setKey(vendor, PqAuth.ML_DSA_87, _pubkey(vendor), false, _secret(vendor));
        VendorSig.Invoice memory invoice = _invoice(1);
        bytes memory signature = _sign(vendor, harness.message(invoice));
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PossessionNotProven.selector, vendor));
        harness.verify(invoice, signature);
    }

    function test_verify_rejectsAZeroVendor() public {
        VendorSig.Invoice memory invoice = _invoice(1);
        invoice.vendor = address(0);
        vm.expectRevert(VendorSig.VendorZero.selector);
        harness.verify(invoice, hex"");
    }

    function testFuzz_amountIsBound(uint256 amount) public view {
        VendorSig.Invoice memory invoice = _invoice(amount);
        harness.verify(invoice, _sign(vendor, harness.message(invoice)));
    }
}
