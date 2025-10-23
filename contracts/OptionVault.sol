// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./utils/ERC20Initializable.sol";

contract OptionVault is ERC20Initializable {
    using SafeERC20 for IERC20;

    IERC20 public depositToken;
    IERC20 public conversionToken;
    IERC20 public premiumToken;

    uint256 public strike;
    uint256 public expiry;

    address public factory;
    address public owner;

    error Expired();
    error NotExpired();
    error NotFactory();

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    function initialize(
        address _factory,
        address _depositToken,
        address _conversionToken,
        address _premiumToken,
        uint256 _strike,
        uint256 _expiry,
        string memory _name,
        string memory _symbol,
        address _owner
    ) external initializer {
        factory = _factory;
        depositToken = IERC20(_depositToken);
        conversionToken = IERC20(_conversionToken);
        premiumToken = IERC20(_premiumToken);
        strike = _strike;
        expiry = _expiry;
        owner = _owner;

        _initializeERC20(_name, _symbol, ERC20(_depositToken).decimals());
    }

    /*//////////////////////////////////////////////////////////////
                        FACTORY-ONLY ENTRYPOINTS
    //////////////////////////////////////////////////////////////*/

    function onWriteOption(address writer, uint256 amount) external onlyFactory {
        _mint(writer, amount);
    }

    function onExercise(address owner_, uint256 exerciseAmount, uint256 /* exerciseCost */) external onlyFactory {
        // factory already transferred conversionTokens in
        if (block.timestamp >= expiry) revert Expired();
        depositToken.safeTransfer(owner_, exerciseAmount);
        // Note: conversionTokens are already in the vault from factory transfer
    }

    function onRedeem(
        address user,
        uint256 burnAmount
    ) external onlyFactory returns (uint256 depShare, uint256 exShare, uint256 premShare) {
        if (block.timestamp < expiry) revert NotExpired();

        uint256 total = totalSupply();
        _burn(user, burnAmount);

        bool isLastUser = burnAmount == total;
        depShare = isLastUser
            ? depositToken.balanceOf(address(this))
            : (depositToken.balanceOf(address(this)) * burnAmount) / total;

        // If conversionToken and premiumToken are the same, calculate combined share from total balance
        if (conversionToken == premiumToken) {
            uint256 combinedBalance = conversionToken.balanceOf(address(this));
            uint256 combinedShare = isLastUser ? combinedBalance : (combinedBalance * burnAmount) / total;
            exShare = combinedShare;
            premShare = 0; // Set to 0 to avoid double transfer
        } else {
            exShare = isLastUser
                ? conversionToken.balanceOf(address(this))
                : (conversionToken.balanceOf(address(this)) * burnAmount) / total;
            premShare = isLastUser
                ? premiumToken.balanceOf(address(this))
                : (premiumToken.balanceOf(address(this)) * burnAmount) / total;
        }

        if (depShare > 0) depositToken.safeTransfer(user, depShare);
        if (exShare > 0) conversionToken.safeTransfer(user, exShare);
        if (premShare > 0) premiumToken.safeTransfer(user, premShare);
    }
}
