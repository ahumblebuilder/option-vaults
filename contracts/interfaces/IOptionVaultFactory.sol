// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IOptionVault.sol";

/// @title IOptionVaultFactory
/// @notice Interface for OptionVaultFactory contract
interface IOptionVaultFactory {
    // Enums
    enum PreviewStatus {
        SUCCESS, // 0
        UNKNOWN_VAULT, // 1
        EXPIRED_SIGNATURE, // 2
        BAD_VALID_UNTIL, // 3
        VAULT_EXPIRED, // 4
        ALREADY_FILLED, // 5
        QUOTE_ID_ALREADY_FILLED, // 6
        BAD_SIGNATURE, // 7
        BELOW_MIN_DEPOSIT, // 8
        ABOVE_MAX_DEPOSIT, // 9
        INSUFFICIENT_USER_BALANCE, // 10
        INSUFFICIENT_USER_ALLOWANCE, // 11
        INSUFFICIENT_SIGNER_BALANCE, // 12
        INSUFFICIENT_SIGNER_ALLOWANCE, // 13
        WRONG_STRIKE, // 14
        WRONG_EXPIRY // 15
    }

    // Events
    event VaultCreated(
        address indexed vault,
        address depositToken,
        address conversionToken,
        address premiumToken,
        uint256 strike,
        uint256 expiry
    );
    event OptionWritten(
        address indexed vault,
        address indexed user,
        address indexed signer,
        uint256 amount,
        uint256 premium
    );
    event Exercised(address indexed vault, uint256 amount, uint256 cost);
    event Redeemed(address indexed vault, address indexed user, uint256 amount);

    // View functions
    function allVaults(uint256 index) external view returns (address);
    function isQuoteIdUsed(address vault, address signer, uint256 quoteId) external view returns (bool);
    function computeWriteOptionHash(
        uint256 strike,
        uint256 expiry,
        uint256 premiumPerUnit,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 validUntil,
        uint256 quoteId
    ) external view returns (bytes32);
    function computeWriteOptionHashAndRecover(
        uint256 strike,
        uint256 expiry,
        uint256 premiumPerUnit,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 validUntil,
        uint256 quoteId,
        bytes calldata signature
    ) external view returns (bytes32 digest, address signer);

    // External functions
    function createVault(
        address depositToken,
        address conversionToken,
        address premiumToken,
        uint256 strike,
        uint256 expiry,
        string calldata name,
        string calldata symbol,
        address owner
    ) external returns (address vaultAddr);
    function writeOption(
        address vault,
        uint256 amount,
        uint256 strike,
        uint256 expiry,
        uint256 premiumPerUnit,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 validUntil,
        uint256 quoteId,
        bytes calldata signature
    ) external;
    function exercise(address vault, uint256 exerciseAmount) external;
    function redeem(address vault) external;
    function previewWriteOption(
        address user,
        address vault,
        uint256 amount,
        uint256 strike,
        uint256 expiry,
        uint256 premiumPerUnit,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 validUntil,
        uint256 quoteId,
        bytes calldata signature
    ) external view returns (PreviewStatus status, uint256 totalPremium);
}
