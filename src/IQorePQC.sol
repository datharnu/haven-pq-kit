// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @notice QoreChain PQC precompiles. Addresses are lower case: Solidity rejects the mixed-case checksum in the docs.
/// @dev `pqcKeyStatus` returns four words on qorechain-diana. The published `@qorechain/evm` 0.14.0 ABI omits `possessionProven`.
interface IQorePQC {
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);

    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven);
}
