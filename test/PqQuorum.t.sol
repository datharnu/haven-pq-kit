// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {PqAuth} from "../src/PqAuth.sol";
import {PqQuorum} from "../src/PqQuorum.sol";
import {PqTestBase} from "./PqTestBase.sol";

contract QuorumHarness {
    using PqQuorum for PqQuorum.Set;

    PqQuorum.Set internal set;

    function init(address[] memory members, uint8 setThreshold) external {
        set.init(members, setThreshold);
    }

    function authorizeQuorum(
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        uint256 maxTtl,
        address[] calldata who,
        bytes[] calldata signatures
    ) external {
        set.authorizeQuorum(action, argsHash, deadline, maxTtl, who, signatures);
    }

    function authorizeAny(
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        uint256 maxTtl,
        address who,
        bytes calldata signature
    ) external {
        set.authorizeAny(action, argsHash, deadline, maxTtl, who, signature);
    }

    function replace(
        address[] memory next,
        uint8 setThreshold,
        uint256 deadline,
        uint256 maxTtl,
        address[] calldata who,
        bytes[] calldata signatures
    ) external {
        set.setMembers(next, setThreshold, deadline, maxTtl, who, signatures);
    }

    function nonce() external view returns (uint256) {
        return set.nonce;
    }

    function threshold() external view returns (uint8) {
        return set.threshold;
    }

    function memberCount() external view returns (uint256) {
        return set.members.length;
    }

    function member(uint256 index) external view returns (address) {
        return set.members[index];
    }

    function quorumMessage(address who, bytes32 action, bytes32 argsHash, uint256 deadline)
        external
        view
        returns (bytes memory)
    {
        return PqAuth.encodeMessage(
            block.chainid, address(this), who, PqQuorum.quorumAction(action), set.nonce, deadline, argsHash
        );
    }

    function anyMessage(address who, bytes32 action, bytes32 argsHash, uint256 deadline)
        external
        view
        returns (bytes memory)
    {
        return PqAuth.encodeMessage(
            block.chainid, address(this), who, PqQuorum.anyAction(action), set.nonce, deadline, argsHash
        );
    }

    function plainMessage(address who, bytes32 action, bytes32 argsHash, uint256 deadline)
        external
        view
        returns (bytes memory)
    {
        return PqAuth.encodeMessage(block.chainid, address(this), who, action, set.nonce, deadline, argsHash);
    }
}

contract PqQuorumTest is PqTestBase {
    QuorumHarness internal harness;
    address internal a = address(0xA11);
    address internal b = address(0xB22);
    address internal c = address(0xC33);
    bytes32 internal action = keccak256("haven.test.quorum");
    bytes32 internal argsHash = keccak256("args");

    function setUp() public override {
        super.setUp();
        harness = new QuorumHarness();
        _register(a);
        _register(b);
        _register(c);
    }

    function _members() internal view returns (address[] memory members) {
        members = new address[](3);
        members[0] = a;
        members[1] = b;
        members[2] = c;
    }

    function _deadline() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    function _share(address who, bytes32 customAction, bytes32 customArgs, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return _sign(who, harness.quorumMessage(who, customAction, customArgs, deadline));
    }

    function _two(uint256 deadline) internal view returns (address[] memory who, bytes[] memory signatures) {
        who = new address[](2);
        signatures = new bytes[](2);
        who[0] = a;
        who[1] = b;
        signatures[0] = _share(a, action, argsHash, deadline);
        signatures[1] = _share(b, action, argsHash, deadline);
    }

    function test_init_storesAnAscendingSet() public {
        harness.init(_members(), 2);
        assertEq(harness.threshold(), 2);
        assertEq(harness.memberCount(), 3);
        assertEq(harness.member(0), a);
    }

    function test_init_rejectsAnUnsortedSet() public {
        address[] memory members = new address[](2);
        members[0] = b;
        members[1] = a;
        vm.expectRevert(abi.encodeWithSelector(PqQuorum.Unsorted.selector, b, a));
        harness.init(members, 2);
    }

    function test_init_rejectsADuplicate() public {
        address[] memory members = new address[](2);
        members[0] = a;
        members[1] = a;
        vm.expectRevert(abi.encodeWithSelector(PqQuorum.Unsorted.selector, a, a));
        harness.init(members, 1);
    }

    function test_init_rejectsAMissingKey() public {
        config.clearKey(c);
        vm.expectRevert(abi.encodeWithSelector(PqAuth.KeyNotRegistered.selector, c));
        harness.init(_members(), 2);
    }

    function test_init_rejectsABadThreshold() public {
        vm.expectRevert(abi.encodeWithSelector(PqQuorum.BadThreshold.selector, 4, 3));
        harness.init(_members(), 4);
    }

    function test_init_rejectsAnEmptySet() public {
        vm.expectRevert(PqQuorum.EmptySet.selector);
        harness.init(new address[](0), 0);
    }

    function test_init_revertsTheSecondTime() public {
        harness.init(_members(), 2);
        vm.expectRevert(PqQuorum.AlreadyInitialised.selector);
        harness.init(_members(), 2);
    }

    function test_quorum_acceptsTwoOfThree() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        (address[] memory who, bytes[] memory signatures) = _two(deadline);
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
        assertEq(harness.nonce(), 1);
    }

    function test_quorum_acceptsAllThree() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        address[] memory who = _members();
        bytes[] memory signatures = new bytes[](3);
        signatures[0] = _share(a, action, argsHash, deadline);
        signatures[1] = _share(b, action, argsHash, deadline);
        signatures[2] = _share(c, action, argsHash, deadline);
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
        assertEq(harness.nonce(), 1);
    }

    function test_quorum_rejectsOneShare() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        address[] memory who = new address[](1);
        bytes[] memory signatures = new bytes[](1);
        who[0] = a;
        signatures[0] = _share(a, action, argsHash, deadline);
        vm.expectRevert(abi.encodeWithSelector(PqQuorum.TooFew.selector, 1, 2));
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
    }

    function test_quorum_rejectsUnsortedSigners() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        address[] memory who = new address[](2);
        bytes[] memory signatures = new bytes[](2);
        who[0] = b;
        who[1] = a;
        signatures[0] = _share(b, action, argsHash, deadline);
        signatures[1] = _share(a, action, argsHash, deadline);
        vm.expectRevert(abi.encodeWithSelector(PqQuorum.Unsorted.selector, b, a));
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
    }

    function test_quorum_rejectsAnOutsider() public {
        address outsider = address(0xD44);
        _register(outsider);
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        address[] memory who = new address[](2);
        bytes[] memory signatures = new bytes[](2);
        who[0] = a;
        who[1] = outsider;
        signatures[0] = _share(a, action, argsHash, deadline);
        signatures[1] = _sign(outsider, harness.quorumMessage(outsider, action, argsHash, deadline));
        vm.expectRevert(abi.encodeWithSelector(PqQuorum.NotMember.selector, outsider));
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
    }

    function test_quorum_rejectsAReplay() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        (address[] memory who, bytes[] memory signatures) = _two(deadline);
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
    }

    function test_quorum_rejectsAPlainPqAuthSignature() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        address[] memory who = new address[](2);
        bytes[] memory signatures = new bytes[](2);
        who[0] = a;
        who[1] = b;
        signatures[0] = _sign(a, harness.plainMessage(a, action, argsHash, deadline));
        signatures[1] = _sign(b, harness.plainMessage(b, action, argsHash, deadline));
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
    }

    function test_any_acceptsOneMember() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        bytes memory signature = _sign(c, harness.anyMessage(c, action, argsHash, deadline));
        harness.authorizeAny(action, argsHash, deadline, 1 days, c, signature);
        assertEq(harness.nonce(), 1);
    }

    function test_any_rejectsAQuorumShare() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        bytes memory share = _share(c, action, argsHash, deadline);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorizeAny(action, argsHash, deadline, 1 days, c, share);
    }

    function test_any_rejectsAnOutsider() public {
        address outsider = address(0xD44);
        _register(outsider);
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        bytes memory signature = _sign(outsider, harness.anyMessage(outsider, action, argsHash, deadline));
        vm.expectRevert(abi.encodeWithSelector(PqQuorum.NotMember.selector, outsider));
        harness.authorizeAny(action, argsHash, deadline, 1 days, outsider, signature);
    }

    function test_setMembers_replacesTheSetAndVoidsTheOldNonce() public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        address[] memory next = new address[](2);
        next[0] = a;
        next[1] = c;
        bytes32 nextHash = keccak256(abi.encode(next, uint8(2)));
        address[] memory who = new address[](2);
        bytes[] memory signatures = new bytes[](2);
        who[0] = a;
        who[1] = b;
        signatures[0] = _sign(a, harness.quorumMessage(a, PqQuorum.SET_ACTION, nextHash, deadline));
        signatures[1] = _sign(b, harness.quorumMessage(b, PqQuorum.SET_ACTION, nextHash, deadline));
        harness.replace(next, 2, deadline, 1 days, who, signatures);
        assertEq(harness.memberCount(), 2);
        assertEq(harness.member(1), c);
        assertEq(harness.nonce(), 1);
        vm.expectRevert(PqAuth.SignatureInvalid.selector);
        harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
    }

    function testFuzz_everyPairOfThree(uint8 mask) public {
        harness.init(_members(), 2);
        uint256 deadline = _deadline();
        address[3] memory all = [a, b, c];
        uint256 count;
        for (uint256 i = 0; i < 3; i++) {
            if ((mask >> i) & 1 == 1) count++;
        }
        address[] memory who = new address[](count);
        bytes[] memory signatures = new bytes[](count);
        uint256 n;
        for (uint256 i = 0; i < 3; i++) {
            if ((mask >> i) & 1 == 1) {
                who[n] = all[i];
                signatures[n] = _share(all[i], action, argsHash, deadline);
                n++;
            }
        }
        if (count >= 2) {
            harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
            assertEq(harness.nonce(), 1);
        } else {
            vm.expectRevert(abi.encodeWithSelector(PqQuorum.TooFew.selector, count, 2));
            harness.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
        }
    }
}
