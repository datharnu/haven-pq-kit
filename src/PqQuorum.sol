// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {PqAuth} from "./PqAuth.sol";

/// @notice A t-of-n set of ML-DSA-87 signers. Quorum shares and single-signer vetoes use different domains.
library PqQuorum {
    uint256 internal constant MAX_MEMBERS = 16;

    bytes32 internal constant QUORUM_DOMAIN = keccak256("haven-pq-kit.PqQuorum.quorum.v1");
    bytes32 internal constant ANY_DOMAIN = keccak256("haven-pq-kit.PqQuorum.any.v1");
    bytes32 public constant SET_ACTION = keccak256("haven-pq-kit.PqQuorum.setMembers");

    struct Set {
        address[] members;
        uint8 threshold;
        uint256 nonce;
    }

    error NotInitialised();
    error AlreadyInitialised();
    error EmptySet();
    error SetTooLarge(uint256 size);
    error BadThreshold(uint8 threshold, uint256 size);
    error Unsorted(address previous, address next);
    error LengthMismatch();
    error TooFew(uint256 got, uint256 need);
    error NotMember(address who);

    function init(Set storage set, address[] memory members, uint8 threshold) internal {
        if (set.members.length != 0 || set.threshold != 0) revert AlreadyInitialised();
        _store(set, members, threshold);
    }

    function quorumAction(bytes32 action) internal pure returns (bytes32) {
        return keccak256(abi.encode(QUORUM_DOMAIN, action));
    }

    function anyAction(bytes32 action) internal pure returns (bytes32) {
        return keccak256(abi.encode(ANY_DOMAIN, action));
    }

    /// @notice At least `threshold` distinct members, passed in strictly ascending order.
    function authorizeQuorum(
        Set storage set,
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        uint256 maxTtl,
        address[] calldata who,
        bytes[] calldata signatures
    ) internal {
        _requireInit(set);
        if (who.length != signatures.length) revert LengthMismatch();
        if (who.length < set.threshold) revert TooFew(who.length, set.threshold);
        PqAuth._checkDeadline(deadline, maxTtl);
        address previous = address(0);
        for (uint256 i = 0; i < who.length; i++) {
            if (who[i] <= previous) revert Unsorted(previous, who[i]);
            previous = who[i];
            if (!_isMember(set, who[i])) revert NotMember(who[i]);
            bytes memory message = PqAuth.encodeMessage(
                block.chainid, address(this), who[i], quorumAction(action), set.nonce, deadline, argsHash
            );
            PqAuth.verify(who[i], message, signatures[i]);
        }
        set.nonce += 1;
    }

    /// @notice One member, alone. The signed action is `anyAction`, so a quorum share cannot be reused here.
    function authorizeAny(
        Set storage set,
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        uint256 maxTtl,
        address who,
        bytes calldata signature
    ) internal {
        _requireInit(set);
        if (!_isMember(set, who)) revert NotMember(who);
        PqAuth._checkDeadline(deadline, maxTtl);
        bytes memory message = PqAuth.encodeMessage(
            block.chainid, address(this), who, anyAction(action), set.nonce, deadline, argsHash
        );
        PqAuth.verify(who, message, signature);
        set.nonce += 1;
    }

    /// @dev Replacing the set consumes the current nonce inside `authorizeQuorum`, so older shares die.
    function setMembers(
        Set storage set,
        address[] memory next,
        uint8 threshold,
        uint256 deadline,
        uint256 maxTtl,
        address[] calldata who,
        bytes[] calldata signatures
    ) internal {
        bytes32 argsHash = keccak256(abi.encode(next, threshold));
        authorizeQuorum(set, SET_ACTION, argsHash, deadline, maxTtl, who, signatures);
        _store(set, next, threshold);
    }

    function _requireInit(Set storage set) private view {
        if (set.threshold == 0) revert NotInitialised();
    }

    function _store(Set storage set, address[] memory members, uint8 threshold) private {
        uint256 size = members.length;
        if (size == 0) revert EmptySet();
        if (size > MAX_MEMBERS) revert SetTooLarge(size);
        if (threshold == 0 || threshold > size) revert BadThreshold(threshold, size);
        address previous = address(0);
        for (uint256 i = 0; i < size; i++) {
            if (members[i] <= previous) revert Unsorted(previous, members[i]);
            previous = members[i];
            PqAuth._loadKey(members[i]);
        }
        set.members = members;
        set.threshold = threshold;
    }

    function _isMember(Set storage set, address who) private view returns (bool) {
        address[] memory members = set.members;
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == who) return true;
        }
        return false;
    }
}
