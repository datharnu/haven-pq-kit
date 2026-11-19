// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IQorePQC} from "./IQorePQC.sol";

/// @notice One ML-DSA-87 signer. Being the transaction sender is never enough.
library PqAuth {
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address internal constant PQC_STATUS = 0x0000000000000000000000000000000000000a02;

    uint8 internal constant ML_DSA_87 = 1;
    uint256 internal constant PUBKEY_LEN = 2592;
    uint256 internal constant SIG_LEN = 4627;
    /// @dev A caller-chosen freshness window cannot exceed this. It stops a deadline of `type(uint256).max`.
    uint256 internal constant MAX_TTL = 30 days;

    bytes32 internal constant DOMAIN = keccak256("haven-pq-kit.PqAuth.v1");

    struct Signer {
        address account;
        uint256 nonce;
    }

    error PqPrecompileUnavailable();
    error NotInitialised();
    error AlreadyInitialised();
    error KeyNotRegistered(address account);
    error WrongAlgorithm(address account, uint8 algorithmId);
    error PossessionNotProven(address account);
    error BadKeyLength(address account, uint256 length);
    error BadSignatureLength(uint256 length);
    error SignatureInvalid();
    error Expired(uint256 deadline);
    error DeadlineTooFar(uint256 deadline, uint256 maxTtl);
    error BadMaxTtl(uint256 maxTtl);

    function init(Signer storage signer, address account) internal {
        if (signer.account != address(0)) revert AlreadyInitialised();
        if (account == address(0)) revert KeyNotRegistered(account);
        _loadKey(account);
        signer.account = account;
    }

    /// @param maxTtl The longest the caller allows between now and `deadline`.
    function authorize(
        Signer storage signer,
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        uint256 maxTtl,
        bytes calldata signature
    ) internal {
        if (signer.account == address(0)) revert NotInitialised();
        _checkDeadline(deadline, maxTtl);
        bytes memory message = encodeMessage(
            block.chainid, address(this), signer.account, action, signer.nonce, deadline, argsHash
        );
        verify(signer.account, message, signature);
        signer.nonce += 1;
    }

    /// @dev Pure so TypeScript and the vector file can pin the same bytes without a chain.
    function encodeMessage(
        uint256 chainId,
        address contractAddr,
        address signer,
        bytes32 action,
        uint256 nonce,
        uint256 deadline,
        bytes32 argsHash
    ) internal pure returns (bytes memory) {
        return abi.encode(DOMAIN, chainId, contractAddr, signer, action, nonce, deadline, argsHash);
    }

    function verify(address account, bytes memory message, bytes calldata signature) internal view {
        bytes memory pubkey = _loadKey(account);
        if (signature.length != SIG_LEN) revert BadSignatureLength(signature.length);
        (bool ok, bytes memory ret) = PQC_VERIFY.staticcall(
            abi.encodeWithSelector(IQorePQC.pqcVerify.selector, pubkey, signature, message)
        );
        // Empty data is what an inactive precompile returns. Never treat it as a valid signature.
        if (!ok || ret.length < 32) revert PqPrecompileUnavailable();
        if (!abi.decode(ret, (bool))) revert SignatureInvalid();
    }

    function _loadKey(address account) internal view returns (bytes memory pubkey) {
        (bool registered, uint8 algorithmId, bytes memory key, bool possessionProven) = _status(account);
        if (!registered) revert KeyNotRegistered(account);
        if (algorithmId != ML_DSA_87) revert WrongAlgorithm(account, algorithmId);
        if (!possessionProven) revert PossessionNotProven(account);
        if (key.length != PUBKEY_LEN) revert BadKeyLength(account, key.length);
        return key;
    }

    function _status(address account)
        private
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven)
    {
        (bool ok, bytes memory ret) =
            PQC_STATUS.staticcall(abi.encodeWithSelector(IQorePQC.pqcKeyStatus.selector, account));
        // A registered key with an empty pubkey is 160 bytes. Shorter than that is not a verdict.
        if (!ok || ret.length < 160) revert PqPrecompileUnavailable();
        return abi.decode(ret, (bool, uint8, bytes, bool));
    }

    function _checkDeadline(uint256 deadline, uint256 maxTtl) internal view {
        if (maxTtl == 0 || maxTtl > MAX_TTL) revert BadMaxTtl(maxTtl);
        if (deadline < block.timestamp) revert Expired(deadline);
        if (deadline > block.timestamp + maxTtl) revert DeadlineTooFar(deadline, maxTtl);
    }
}
