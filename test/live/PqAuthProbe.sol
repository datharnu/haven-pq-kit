// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IQorePQC} from "../../src/IQorePQC.sol";

/// @notice Deployless probe. An eth_call of this creation code returns the live key status.
/// @dev The constructor returns the ABI payload as its "runtime code", which is the eth_call result.
contract PqAuthProbe {
    constructor(address account) {
        (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven) =
            IQorePQC(0x0000000000000000000000000000000000000a02).pqcKeyStatus(account);
        bytes memory encoded = abi.encode(registered, algorithmId, pubkey.length, possessionProven);
        assembly {
            return(add(encoded, 32), mload(encoded))
        }
    }
}
