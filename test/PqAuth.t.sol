// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {PqAuth} from "../src/PqAuth.sol";
import {PqcMockConfig} from "./mocks/MockQorePQC.sol";
import {PqTestBase} from "./PqTestBase.sol";

contract AuthHarness {
    using PqAuth for PqAuth.Signer;

    PqAuth.Signer internal auth;

    function init(address signerAccount) external {
        auth.init(signerAccount);
    }

    function authorize(bytes32 action, bytes32 argsHash, uint256 deadline, uint256 maxTtl, bytes calldata signature)
        external
    {
        auth.authorize(action, argsHash, deadline, maxTtl, signature);
    }

    function account() external view returns (address) {
        return auth.account;
    }

    function nonce() external view returns (uint256) {
        return auth.nonce;
    }

    function message(bytes32 action, bytes32 argsHash, uint256 deadline) external view returns (bytes memory) {
        return PqAuth.encodeMessage(block.chainid, address(this), auth.account, action, auth.nonce, deadline, argsHash);
    }
}

contract PqAuthTest is PqTestBase {
    AuthHarness internal harness;
    address internal owner = address(0xA11CE);
    bytes32 internal action = keccak256("haven.test.sweep");
    bytes32 internal argsHash = keccak256("args");

    function setUp() public override {
        super.setUp();
        harness = new AuthHarness();
        _register(owner);
    }

    function _deadline(uint256 ttl) internal view returns (uint256) {
        return block.timestamp + ttl;
    }

    function _signed(bytes32 customAction, bytes32 customArgs, uint256 deadline) internal view returns (bytes memory) {
        return _sign(owner, harness.message(customAction, customArgs, deadline));
    }

    function test_init_storesTheAccount() public {
        harness.init(owner);
        assertEq(harness.account(), owner);
        assertEq(harness.nonce(), 0);
    }

    function test_init_revertsWithoutAKey() public {
        address stranger = address(0xBEEF);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.KeyNotRegistered.selector, stranger));
        harness.init(stranger);
    }

    function test_init_revertsForTheWrongAlgorithm() public {
        config.setKey(owner, 2, _pubkey(owner), true, _secret(owner));
        vm.expectRevert(abi.encodeWithSelector(PqAuth.WrongAlgorithm.selector, owner, 2));
        harness.init(owner);
    }

    function test_init_revertsWithoutPossession() public {
        config.setKey(owner, PqAuth.ML_DSA_87, _pubkey(owner), false, _secret(owner));
        vm.expectRevert(abi.encodeWithSelector(PqAuth.PossessionNotProven.selector, owner));
        harness.init(owner);
    }

    function test_init_revertsForAShortKey() public {
        config.setKey(owner, PqAuth.ML_DSA_87, hex"01", true, _secret(owner));
        vm.expectRevert(abi.encodeWithSelector(PqAuth.BadKeyLength.selector, owner, 1));
        harness.init(owner);
    }

    function test_init_revertsTheSecondTime() public {
        harness.init(owner);
        vm.expectRevert(PqAuth.AlreadyInitialised.selector);
        harness.init(owner);
    }

    function test_init_revertsForTheZeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(PqAuth.KeyNotRegistered.selector, address(0)));
        harness.init(address(0));
    }

    function test_authorize_movesFundsAuthorityAndIncrementsNonce() public {
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        harness.authorize(action, argsHash, deadline, 1 days, _signed(action, argsHash, deadline));
        assertEq(harness.nonce(), 1);
    }

    function test_authorize_rejectsAReplay() public {
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        bytes memory signature = _signed(action, argsHash, deadline);
        harness.authorize(action, argsHash, deadline, 1 days, signature);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorize(action, argsHash, deadline, 1 days, signature);
    }

    function test_authorize_rejectsTamperedArgs() public {
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        bytes memory signature = _signed(action, argsHash, deadline);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorize(action, keccak256("other"), deadline, 1 days, signature);
    }

    function test_authorize_rejectsTamperedAction() public {
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        bytes memory signature = _signed(action, argsHash, deadline);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorize(keccak256("other"), argsHash, deadline, 1 days, signature);
    }

    function test_authorize_rejectsAnotherContract() public {
        harness.init(owner);
        AuthHarness other = new AuthHarness();
        other.init(owner);
        uint256 deadline = _deadline(1 hours);
        bytes memory signature = _signed(action, argsHash, deadline);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        other.authorize(action, argsHash, deadline, 1 days, signature);
    }

    function test_authorize_rejectsAnotherChain() public {
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        bytes memory signature = _signed(action, argsHash, deadline);
        vm.chainId(9801);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorize(action, argsHash, deadline, 1 days, signature);
    }

    function test_authorize_rejectsAnExpiredDeadline() public {
        harness.init(owner);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.Expired.selector, block.timestamp - 1));
        harness.authorize(action, argsHash, block.timestamp - 1, 1 days, hex"");
    }

    function test_authorize_rejectsADeadlinePastTheWindow() public {
        harness.init(owner);
        uint256 deadline = _deadline(2 days);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.DeadlineTooFar.selector, deadline, 1 days));
        harness.authorize(action, argsHash, deadline, 1 days, hex"");
    }

    function test_authorize_rejectsAZeroMaxTtl() public {
        harness.init(owner);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.BadMaxTtl.selector, 0));
        harness.authorize(action, argsHash, _deadline(1), 0, hex"");
    }

    function test_authorize_rejectsAMaxTtlAboveTheCap() public {
        harness.init(owner);
        uint256 maxTtl = 31 days;
        vm.expectRevert(abi.encodeWithSelector(PqAuth.BadMaxTtl.selector, maxTtl));
        harness.authorize(action, argsHash, _deadline(1 hours), maxTtl, hex"");
    }

    function test_authorize_rejectsAShortSignature() public {
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.BadSignatureLength.selector, 4));
        harness.authorize(action, argsHash, deadline, 1 days, hex"01020304");
    }

    function test_authorize_rejectsAFlippedMac() public {
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        bytes memory signature = _signed(action, argsHash, deadline);
        signature[0] = bytes1(uint8(signature[0]) ^ 0x01);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorize(action, argsHash, deadline, 1 days, signature);
    }

    function test_authorize_rejectsAnInactiveStatusPrecompile() public {
        harness.init(owner);
        config.setStatusMode(PqcMockConfig.StatusMode.Inactive);
        vm.expectRevert(PqAuth.PqPrecompileUnavailable.selector);
        harness.authorize(action, argsHash, _deadline(1 hours), 1 days, new bytes(4627));
    }

    function test_authorize_rejectsARevertingStatusPrecompile() public {
        harness.init(owner);
        config.setStatusMode(PqcMockConfig.StatusMode.Revert);
        vm.expectRevert(PqAuth.PqPrecompileUnavailable.selector);
        harness.authorize(action, argsHash, _deadline(1 hours), 1 days, new bytes(4627));
    }

    function test_authorize_rejectsAnInactiveVerifyPrecompile() public {
        harness.init(owner);
        config.setVerifyMode(PqcMockConfig.VerifyMode.Inactive);
        uint256 deadline = _deadline(1 hours);
        bytes memory signature = _signed(action, argsHash, deadline);
        vm.expectRevert(PqAuth.PqPrecompileUnavailable.selector);
        harness.authorize(action, argsHash, deadline, 1 days, signature);
    }

    function test_authorize_rejectsAFalseVerdict() public {
        harness.init(owner);
        config.setVerifyMode(PqcMockConfig.VerifyMode.AlwaysInvalid);
        uint256 deadline = _deadline(1 hours);
        bytes memory signature = _signed(action, argsHash, deadline);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorize(action, argsHash, deadline, 1 days, signature);
    }

    function test_authorize_followsAKeyRotation() public {
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        bytes memory oldSignature = _signed(action, argsHash, deadline);
        bytes memory rotated = _pubkey(address(0xB0B));
        rotated[32] = 0x02;
        bytes32 newSecret = keccak256("rotated");
        config.setKey(owner, PqAuth.ML_DSA_87, rotated, true, newSecret);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorize(action, argsHash, deadline, 1 days, oldSignature);

        bytes memory message = harness.message(action, argsHash, deadline);
        bytes memory fresh = new bytes(4627);
        bytes32 mac = keccak256(abi.encode(newSecret, keccak256(message)));
        assembly {
            mstore(add(fresh, 32), mac)
        }
        harness.authorize(action, argsHash, deadline, 1 days, fresh);
        assertEq(harness.nonce(), 1);
    }

    function test_authorize_revertsBeforeInit() public {
        vm.expectRevert(PqAuth.NotInitialised.selector);
        harness.authorize(action, argsHash, _deadline(1 hours), 1 days, hex"");
    }

    function testFuzz_anyArgsInsideTheWindow(bytes32 fuzzAction, bytes32 fuzzArgs, uint256 ttl) public {
        ttl = bound(ttl, 1, 1 days);
        harness.init(owner);
        uint256 deadline = _deadline(ttl);
        harness.authorize(fuzzAction, fuzzArgs, deadline, 1 days, _signed(fuzzAction, fuzzArgs, deadline));
        assertEq(harness.nonce(), 1);
    }

    function testFuzz_onlyTheCurrentNonceVerifies(uint8 steps, uint256 otherNonce) public {
        steps = uint8(bound(steps, 0, 12));
        harness.init(owner);
        uint256 deadline = _deadline(1 hours);
        for (uint256 i = 0; i < steps; i++) {
            harness.authorize(action, argsHash, deadline, 1 days, _signed(action, argsHash, deadline));
        }
        assertEq(harness.nonce(), steps);

        vm.assume(otherNonce != steps);
        bytes memory stale = _sign(
            owner, PqAuth.encodeMessage(block.chainid, address(harness), owner, action, otherNonce, deadline, argsHash)
        );
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorize(action, argsHash, deadline, 1 days, stale);
        assertEq(harness.nonce(), steps);
    }

    function testFuzz_aDeadlineOutsideTheWindowReverts(uint256 ttl) public {
        ttl = bound(ttl, 1 days + 1, 30 days);
        harness.init(owner);
        uint256 deadline = block.timestamp + ttl;
        vm.expectRevert(abi.encodeWithSelector(PqAuth.DeadlineTooFar.selector, deadline, 1 days));
        harness.authorize(action, argsHash, deadline, 1 days, hex"");
    }
}
