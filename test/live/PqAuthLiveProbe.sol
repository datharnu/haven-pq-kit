// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {PqAuth} from "../../src/PqAuth.sol";

/// @notice A real PqAuth user, created inside the probe so nothing is deployed.
contract LiveAuthTarget {
    using PqAuth for PqAuth.Signer;

    PqAuth.Signer internal signer;

    function init(address account) external {
        signer.init(account);
    }

    function authorize(bytes32 action, bytes32 argsHash, uint256 deadline, bytes calldata signature) external {
        signer.authorize(action, argsHash, deadline, 1 days, signature);
    }

    function nonce() external view returns (uint256) {
        return signer.nonce;
    }
}

/// @notice Run through `eth_call` of its creation code. Returns what PqAuth did against the live precompiles:
/// abi.encode(target, nonceAfter, badSignatureError, replayError, noKeyError).
/// `0xffffffff` in an error slot means the call was accepted when it should not have been.
contract PqAuthLiveProbe {
    bytes4 internal constant ACCEPTED = 0xffffffff;

    constructor(
        address account,
        address noKeyAccount,
        bytes32 action,
        bytes32 argsHash,
        uint256 deadline,
        bytes memory good,
        bytes memory bad
    ) {
        LiveAuthTarget target = new LiveAuthTarget();
        target.init(account);

        bytes4 badError = ACCEPTED;
        try target.authorize(action, argsHash, deadline, bad) {}
        catch (bytes memory reason) {
            badError = bytes4(reason);
        }

        target.authorize(action, argsHash, deadline, good);

        bytes4 replayError = ACCEPTED;
        try target.authorize(action, argsHash, deadline, good) {}
        catch (bytes memory reason) {
            replayError = bytes4(reason);
        }

        LiveAuthTarget empty = new LiveAuthTarget();
        bytes4 noKeyError = ACCEPTED;
        try empty.init(noKeyAccount) {}
        catch (bytes memory reason) {
            noKeyError = bytes4(reason);
        }

        bytes memory out = abi.encode(address(target), target.nonce(), badError, replayError, noKeyError);
        assembly {
            return(add(out, 32), mload(out))
        }
    }
}
