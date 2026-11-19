// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IQorePQC} from "../../src/IQorePQC.sol";

/// @notice Shared key store. Both etched precompiles read it, so they agree.
contract PqcMockConfig {
    enum StatusMode {
        Normal,
        Inactive,
        Revert
    }

    enum VerifyMode {
        Normal,
        Inactive,
        Revert,
        AlwaysValid,
        AlwaysInvalid
    }

    struct Key {
        bool exists;
        bool registered;
        uint8 algorithmId;
        bool possessionProven;
        bytes32 secret;
        bytes pubkey;
    }

    StatusMode public statusMode;
    VerifyMode public verifyMode;
    mapping(address => Key) private _keys;
    mapping(bytes32 => address) public accountOfPubkey;

    function setStatusMode(StatusMode mode) external {
        statusMode = mode;
    }

    function setVerifyMode(VerifyMode mode) external {
        verifyMode = mode;
    }

    function setKey(address account, uint8 algorithmId, bytes calldata pubkey, bool possessionProven, bytes32 secret)
        external
    {
        _keys[account] = Key({
            exists: true,
            registered: true,
            algorithmId: algorithmId,
            possessionProven: possessionProven,
            secret: secret,
            pubkey: pubkey
        });
        if (pubkey.length > 0) accountOfPubkey[keccak256(pubkey)] = account;
    }

    function clearKey(address account) external {
        bytes memory pubkey = _keys[account].pubkey;
        if (pubkey.length > 0) delete accountOfPubkey[keccak256(pubkey)];
        delete _keys[account];
    }

    function key(address account)
        external
        view
        returns (bool exists, bool registered, uint8 algorithmId, bool possessionProven, bytes32 secret, bytes memory pubkey)
    {
        Key memory stored = _keys[account];
        return
            (stored.exists, stored.registered, stored.algorithmId, stored.possessionProven, stored.secret, stored.pubkey);
    }
}

/// @dev Runtime code is etched at the real precompile addresses. `config` is an immutable, so the copy keeps it.
contract MockQorePQC is IQorePQC {
    PqcMockConfig public immutable config;

    constructor(PqcMockConfig config_) {
        config = config_;
    }

    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven)
    {
        PqcMockConfig.StatusMode mode = config.statusMode();
        if (mode == PqcMockConfig.StatusMode.Inactive) {
            assembly {
                return(0, 0)
            }
        }
        if (mode == PqcMockConfig.StatusMode.Revert) revert("mock status revert");
        (bool exists, bool isRegistered, uint8 algo, bool proven,, bytes memory keyBytes) = config.key(account);
        if (!exists) return (false, 0, "", false);
        return (isRegistered, algo, keyBytes, proven);
    }

    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid)
    {
        PqcMockConfig.VerifyMode mode = config.verifyMode();
        if (mode == PqcMockConfig.VerifyMode.Inactive) {
            assembly {
                return(0, 0)
            }
        }
        if (mode == PqcMockConfig.VerifyMode.Revert) revert("mock verify revert");
        if (mode == PqcMockConfig.VerifyMode.AlwaysValid) return true;
        if (mode == PqcMockConfig.VerifyMode.AlwaysInvalid) return false;
        if (pubkey.length != 2592 || signature.length != 4627) return false;
        address account = config.accountOfPubkey(keccak256(pubkey));
        if (account == address(0)) return false;
        (bool exists,,,, bytes32 secret,) = config.key(account);
        if (!exists) return false;
        return _mac(signature) == keccak256(abi.encode(secret, keccak256(message)));
    }

    function _mac(bytes calldata signature) private pure returns (bytes32 mac) {
        assembly {
            mac := calldataload(signature.offset)
        }
    }
}
