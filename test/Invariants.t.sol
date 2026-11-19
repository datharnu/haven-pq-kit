// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PqAuth} from "../src/PqAuth.sol";
import {PqQuorum} from "../src/PqQuorum.sol";
import {AuthHarness} from "./PqAuth.t.sol";
import {QuorumHarness} from "./PqQuorum.t.sol";
import {PqTestBase} from "./PqTestBase.sol";
import {PqTestKeys} from "./PqTestKeys.sol";

/// @notice Random honest and hostile calls against one signer and one 2-of-3 set.
contract AuthHandler is Test {
    AuthHarness public immutable auth;
    QuorumHarness public immutable quorum;
    address public immutable owner;
    address[3] internal members;
    address internal constant OUTSIDER = address(0xD44);

    uint256 public honestAccepted;
    uint256 public quorumAccepted;
    uint256 public hostileAccepted;
    bytes internal lastAuthSignature;
    bytes32 internal lastAction;
    bytes32 internal lastArgs;
    uint256 internal lastDeadline;

    constructor(AuthHarness auth_, QuorumHarness quorum_, address owner_, address[3] memory members_) {
        auth = auth_;
        quorum = quorum_;
        owner = owner_;
        members = members_;
    }

    function _deadline(uint256 ttl) internal view returns (uint256) {
        return block.timestamp + bound(ttl, 1, 1 days);
    }

    function honest(bytes32 action, bytes32 argsHash, uint256 ttl) external {
        uint256 deadline = _deadline(ttl);
        bytes memory signature = PqTestKeys.sign(owner, auth.message(action, argsHash, deadline));
        auth.authorize(action, argsHash, deadline, 1 days, signature);
        honestAccepted += 1;
        lastAuthSignature = signature;
        lastAction = action;
        lastArgs = argsHash;
        lastDeadline = deadline;
    }

    function replay() external {
        if (lastAuthSignature.length == 0) return;
        _hostileAuth(lastAction, lastArgs, lastDeadline, lastAuthSignature);
    }

    function forged(bytes32 action, bytes32 argsHash, uint256 ttl, bytes32 mac) external {
        bytes memory signature = new bytes(PqAuth.SIG_LEN);
        assembly {
            mstore(add(signature, 32), mac)
        }
        _hostileAuth(action, argsHash, _deadline(ttl), signature);
    }

    function wrongSigner(bytes32 action, bytes32 argsHash, uint256 ttl) external {
        uint256 deadline = _deadline(ttl);
        _hostileAuth(action, argsHash, deadline, PqTestKeys.sign(OUTSIDER, auth.message(action, argsHash, deadline)));
    }

    function tamperedArgs(bytes32 action, bytes32 argsHash, bytes32 otherArgs, uint256 ttl) external {
        if (argsHash == otherArgs) return;
        uint256 deadline = _deadline(ttl);
        _hostileAuth(action, otherArgs, deadline, PqTestKeys.sign(owner, auth.message(action, argsHash, deadline)));
    }

    function quorumHonest(bytes32 action, bytes32 argsHash, uint8 mask, uint256 ttl) external {
        (address[] memory who, bytes[] memory signatures, uint256 deadline) = _shares(action, argsHash, mask, ttl);
        if (who.length < 2) return;
        quorum.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures);
        quorumAccepted += 1;
    }

    function quorumOneShare(bytes32 action, bytes32 argsHash, uint8 index, uint256 ttl) external {
        uint256 deadline = _deadline(ttl);
        address[] memory who = new address[](1);
        bytes[] memory signatures = new bytes[](1);
        who[0] = members[index % 3];
        signatures[0] = PqTestKeys.sign(who[0], quorum.quorumMessage(who[0], action, argsHash, deadline));
        try quorum.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures) {
            hostileAccepted += 1;
        } catch {}
    }

    function quorumVetoAsShare(bytes32 action, bytes32 argsHash, uint256 ttl) external {
        uint256 deadline = _deadline(ttl);
        address[] memory who = new address[](2);
        bytes[] memory signatures = new bytes[](2);
        who[0] = members[0];
        who[1] = members[1];
        signatures[0] = PqTestKeys.sign(who[0], quorum.anyMessage(who[0], action, argsHash, deadline));
        signatures[1] = PqTestKeys.sign(who[1], quorum.anyMessage(who[1], action, argsHash, deadline));
        try quorum.authorizeQuorum(action, argsHash, deadline, 1 days, who, signatures) {
            hostileAccepted += 1;
        } catch {}
    }

    function _shares(bytes32 action, bytes32 argsHash, uint8 mask, uint256 ttl)
        internal
        view
        returns (address[] memory who, bytes[] memory signatures, uint256 deadline)
    {
        deadline = _deadline(ttl);
        uint256 count;
        for (uint256 i = 0; i < 3; i++) {
            if (mask & (1 << i) != 0) count++;
        }
        who = new address[](count);
        signatures = new bytes[](count);
        uint256 j;
        for (uint256 i = 0; i < 3; i++) {
            if (mask & (1 << i) == 0) continue;
            who[j] = members[i];
            signatures[j] = PqTestKeys.sign(members[i], quorum.quorumMessage(members[i], action, argsHash, deadline));
            j++;
        }
    }

    function _hostileAuth(bytes32 action, bytes32 argsHash, uint256 deadline, bytes memory signature) internal {
        try auth.authorize(action, argsHash, deadline, 1 days, signature) {
            hostileAccepted += 1;
        } catch {}
    }
}

contract InvariantsTest is PqTestBase {
    AuthHarness internal auth;
    QuorumHarness internal quorum;
    AuthHandler internal handler;
    address internal owner = address(0xA11CE);

    function setUp() public override {
        super.setUp();
        address[3] memory members = [address(0xA11), address(0xB22), address(0xC33)];
        _register(owner);
        for (uint256 i = 0; i < 3; i++) {
            _register(members[i]);
        }
        auth = new AuthHarness();
        auth.init(owner);
        quorum = new QuorumHarness();
        address[] memory list = new address[](3);
        for (uint256 i = 0; i < 3; i++) {
            list[i] = members[i];
        }
        quorum.init(list, 2);
        handler = new AuthHandler(auth, quorum, owner, members);
        targetContract(address(handler));
    }

    /// @dev No forged, replayed, re-targeted or under-quorum call has ever been accepted.
    function invariant_noHostileCallIsAccepted() public view {
        assertEq(handler.hostileAccepted(), 0);
    }

    /// @dev The signer nonce moves once per accepted honest call and never otherwise.
    function invariant_signerNonceCountsHonestCalls() public view {
        assertEq(auth.nonce(), handler.honestAccepted());
    }

    /// @dev The set nonce moves once per accepted quorum and never otherwise.
    function invariant_setNonceCountsQuorums() public view {
        assertEq(quorum.nonce(), handler.quorumAccepted());
    }

    function invariant_theSignerNeverChanges() public view {
        assertEq(auth.account(), owner);
    }

    function invariant_theSetNeverChanges() public view {
        assertEq(quorum.memberCount(), 3);
        assertEq(quorum.threshold(), 2);
    }
}
