// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IOptionVault
/// @notice Interface for OptionVault contract
interface IOptionVault {
    // Events
    event WriteOption(address indexed user, uint256 amount);
    event Exercise(address indexed user, uint256 amount, uint256 cost);
    event Redeem(address indexed user, uint256 amount);

    // View functions
    function depositToken() external view returns (IERC20);
    function conversionToken() external view returns (IERC20);
    function premiumToken() external view returns (IERC20);
    function strike() external view returns (uint256);
    function expiry() external view returns (uint256);
    function owner() external view returns (address);

    // External functions
    function onWriteOption(address user, uint256 amount) external;
    function onExercise(address owner_, uint256 exerciseAmount, uint256 exerciseCost) external;
    function onRedeem(
        address user,
        uint256 burnAmount
    ) external returns (uint256 depShare, uint256 exShare, uint256 premShare);
}
