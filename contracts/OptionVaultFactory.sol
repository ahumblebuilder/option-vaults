// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./OptionVault.sol";

contract OptionVaultFactory is Ownable, EIP712 {
    using Clones for address;
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    address public immutable implementation;
    address[] public allVaults;

    mapping(address => bool) internal _knownVaults;
    mapping(bytes32 => bool) internal _isUsed;
    mapping(address => mapping(address => mapping(uint256 => bool))) internal _usedQuoteIds;

    error AlreadyUsed();
    error UnknownVault();
    error BadSignature();
    error NotVaultOwner();
    error NoBalance();
    error Expired();
    error QuoteIdAlreadyUsed();

    // EIP712 type hash for WriteOption message
    bytes32 private constant WRITE_OPTION_TYPEHASH =
        keccak256(
            "WriteOption(uint256 strike,uint256 expiry,uint256 premiumPerUnit,uint256 minDeposit,uint256 maxDeposit,uint256 validUntil,uint256 quoteId)"
        );

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
        address indexed writer,
        address indexed signer,
        uint256 amount,
        uint256 premium
    );
    event Exercised(address indexed vault, uint256 exerciseAmount, uint256 cost);
    event Redeemed(address indexed vault, address indexed user, uint256 burned);

    constructor(address _implementation) Ownable(msg.sender) EIP712("OptionVault", "1") {
        implementation = _implementation;
    }

    /*//////////////////////////////////////////////////////////////
                            VAULT MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    function createVault(
        address depositToken,
        address conversionToken,
        address premiumToken,
        uint256 strike,
        uint256 expiry,
        string calldata name,
        string calldata symbol,
        address owner
    ) external onlyOwner returns (address vaultAddr) {
        vaultAddr = Clones.cloneDeterministic(implementation, keccak256(abi.encode(allVaults.length)));
        OptionVault(vaultAddr).initialize(
            address(this),
            depositToken,
            conversionToken,
            premiumToken,
            strike,
            expiry,
            name,
            symbol,
            owner
        );
        allVaults.push(vaultAddr);
        _knownVaults[vaultAddr] = true;
        emit VaultCreated(vaultAddr, depositToken, conversionToken, premiumToken, strike, expiry);
    }

    /*//////////////////////////////////////////////////////////////
                                USER ACTIONS
    //////////////////////////////////////////////////////////////*/

    function writeOption(
        address vault,
        uint256 amount,
        uint256 premiumPerUnit,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 validUntil,
        uint256 quoteId,
        bytes calldata signature
    ) external {
        if (!_knownVaults[vault]) revert UnknownVault();

        OptionVault v = OptionVault(vault);
        if (block.timestamp > validUntil) revert Expired();

        // recover signer using EIP712
        (bytes32 digest, address signer) = computeWriteOptionHashAndRecover(
            v.strike(),
            v.expiry(),
            premiumPerUnit,
            minDeposit,
            maxDeposit,
            validUntil,
            quoteId,
            signature
        );
        if (_isUsed[digest]) revert AlreadyUsed();
        if (signer == address(0)) revert BadSignature();
        if (_usedQuoteIds[vault][signer][quoteId]) revert QuoteIdAlreadyUsed();

        _isUsed[digest] = true;
        _usedQuoteIds[vault][signer][quoteId] = true;

        // send premium from signer to user
        uint256 premium = (premiumPerUnit * amount) / (10 ** ERC20(address(v.depositToken())).decimals());
        _pullTokens(v.premiumToken(), signer, msg.sender, premium);

        // mint receipts
        v.onWriteOption(msg.sender, amount);

        // pull deposit tokens from user to vault
        _pullTokens(v.depositToken(), msg.sender, vault, amount);
        emit OptionWritten(vault, msg.sender, signer, amount, premium);
    }

    /// @notice owner exercises through factory
    function exercise(address vault, uint256 exerciseAmount) external {
        if (!_knownVaults[vault]) revert UnknownVault();

        OptionVault v = OptionVault(vault);
        if (msg.sender != v.owner()) revert NotVaultOwner();
        if (block.timestamp >= v.expiry()) revert Expired();

        // exercise amount is in deposit tokens (eg 1.5 weth)
        // strike in exercise token (eg 4000 usdc)
        // cost is in exercise token (eg 1.5 * 1e18 * 4000 * 1e6 / 1e18 = 6000 usdc)
        uint256 cost = (exerciseAmount * v.strike()) / (10 ** ERC20(address(v.depositToken())).decimals());

        _pullTokens(v.conversionToken(), msg.sender, vault, cost);
        v.onExercise(msg.sender, exerciseAmount, cost);

        emit Exercised(vault, exerciseAmount, cost);
    }

    /// @notice users redeem via factory
    function redeem(address vault) external {
        if (!_knownVaults[vault]) revert UnknownVault();

        OptionVault v = OptionVault(vault);
        uint256 userBal = v.balanceOf(msg.sender);
        if (userBal == 0) revert NoBalance();
        v.onRedeem(msg.sender, userBal);
        emit Redeemed(vault, msg.sender, userBal);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function allVaultsLength() external view returns (uint256) {
        return allVaults.length;
    }

    function isKnownVault(address vault) external view returns (bool) {
        return _knownVaults[vault];
    }

    /*//////////////////////////////////////////////////////////////
                            EIP712 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Compute EIP712 hash for WriteOption message
    /// @param strike The strike price
    /// @param expiry The expiry timestamp
    /// @param premiumPerUnit Premium per unit
    /// @param minDeposit Minimum deposit amount
    /// @param maxDeposit Maximum deposit amount
    /// @param validUntil Timestamp until which the signature is valid
    /// @param quoteId Unique identifier for the quote
    /// @return The EIP712 digest
    function computeWriteOptionHash(
        uint256 strike,
        uint256 expiry,
        uint256 premiumPerUnit,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 validUntil,
        uint256 quoteId
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                WRITE_OPTION_TYPEHASH,
                strike,
                expiry,
                premiumPerUnit,
                minDeposit,
                maxDeposit,
                validUntil,
                quoteId
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice Compute EIP712 hash and recover signer from signature
    /// @param strike The strike price
    /// @param expiry The expiry timestamp
    /// @param premiumPerUnit Premium per unit
    /// @param minDeposit Minimum deposit amount
    /// @param maxDeposit Maximum deposit amount
    /// @param validUntil Timestamp until which the signature is valid
    /// @param quoteId Unique identifier for the quote
    /// @param signature The signature to verify
    /// @return digest The EIP712 digest
    /// @return signer The recovered signer address
    function computeWriteOptionHashAndRecover(
        uint256 strike,
        uint256 expiry,
        uint256 premiumPerUnit,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 validUntil,
        uint256 quoteId,
        bytes calldata signature
    ) public view returns (bytes32 digest, address signer) {
        digest = computeWriteOptionHash(strike, expiry, premiumPerUnit, minDeposit, maxDeposit, validUntil, quoteId);
        signer = digest.recover(signature);
    }

    /// @notice Check if a quoteId has been used for a specific vault and signer
    /// @param vault The vault address
    /// @param signer The signer address
    /// @param quoteId The quote identifier
    /// @return True if the quoteId has been used
    function isQuoteIdUsed(address vault, address signer, uint256 quoteId) external view returns (bool) {
        return _usedQuoteIds[vault][signer][quoteId];
    }

    /*//////////////////////////////////////////////////////////////
                            TOKEN UTILITIES
    //////////////////////////////////////////////////////////////*/

    function _pullTokens(IERC20 token, address from, address to, uint256 amount) internal {
        token.safeTransferFrom(from, to, amount);
    }
}
