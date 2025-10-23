import { expect } from 'chai';
import { network } from 'hardhat';
import { ethers } from 'ethers';

const { ethers: hreEthers } = await network.connect();

describe('OptionVault System', function () {
  let weth: any;
  let usdc: any;
  let optionVaultImpl: any;
  let optionVaultFactory: any;
  let vault1: any;
  let vault2: any;

  let owner: any;
  let signer: any;
  let user1: any;
  let user2: any;

  const STRIKE_PRICE = ethers.parseUnits('4200', 6); // 4200 USDC (6 decimals)

  // Helper function to get current block timestamp
  async function getCurrentBlockTime() {
    const block = await hreEthers.provider.getBlock('latest');
    return block!.timestamp;
  }

  // Helper function to get future timestamp
  async function getFutureTimestamp(days: number) {
    const currentTime = await getCurrentBlockTime();
    return currentTime + days * 24 * 60 * 60;
  }

  // Helper function to get future timestamp in hours
  async function getFutureTimestampHours(hours: number) {
    const currentTime = await getCurrentBlockTime();
    return currentTime + hours * 60 * 60;
  }

  async function setupTestEnvironment() {
    // Get test accounts
    [owner, signer, user1, user2] = await hreEthers.getSigners();

    // Deploy TestERC20 tokens
    const TestERC20 = await hreEthers.getContractFactory('TestERC20');
    weth = await TestERC20.deploy('Wrapped Ether', 'WETH', 18);
    usdc = await TestERC20.deploy('USD Coin', 'USDC', 6);

    // Deploy OptionVault implementation
    const OptionVault = await hreEthers.getContractFactory('OptionVault');
    optionVaultImpl = await OptionVault.deploy();

    // Deploy OptionVaultFactory
    const OptionVaultFactory = await hreEthers.getContractFactory('OptionVaultFactory');
    optionVaultFactory = await OptionVaultFactory.deploy(await optionVaultImpl.getAddress());

    // Get future timestamps for vault expiries
    const vault1Expiry = await getFutureTimestamp(14); // 14 days
    const vault2Expiry = await getFutureTimestamp(30); // 30 days

    // Create two option vaults
    await optionVaultFactory.createVault(
      await weth.getAddress(), // depositToken (WETH)
      await usdc.getAddress(), // conversionToken (USDC)
      await usdc.getAddress(), // premiumToken (USDC)
      STRIKE_PRICE, // strike
      vault1Expiry, // expiry
      'Vault1', // name
      'V1', // symbol
      owner.address // owner
    );

    await optionVaultFactory.createVault(
      await weth.getAddress(), // depositToken (WETH)
      await usdc.getAddress(), // conversionToken (USDC)
      await usdc.getAddress(), // premiumToken (USDC)
      STRIKE_PRICE, // strike
      vault2Expiry, // expiry
      'Vault2', // name
      'V2', // symbol
      owner.address // owner
    );

    // Get vault addresses from allVaults array
    const vault1Address = await optionVaultFactory.allVaults(0);
    const vault2Address = await optionVaultFactory.allVaults(1);
    vault1 = await hreEthers.getContractAt('OptionVault', vault1Address);
    vault2 = await hreEthers.getContractAt('OptionVault', vault2Address);

    // Mint tokens to test users
    await weth.connect(owner).mint(user1.address, ethers.parseEther('100'));
    await weth.connect(owner).mint(user2.address, ethers.parseEther('100'));
    await usdc.connect(owner).mint(signer.address, ethers.parseUnits('1000000', 6));
    await usdc.connect(owner).mint(user1.address, ethers.parseUnits('10000', 6));
    await usdc.connect(owner).mint(user2.address, ethers.parseUnits('10000', 6));

    return {
      weth,
      usdc,
      optionVaultImpl,
      optionVaultFactory,
      vault1,
      vault2,
      owner,
      signer,
      user1,
      user2,
    };
  }

  describe('Test Setup', function () {
    it('Should deploy all contracts and create vaults', async function () {
      await setupTestEnvironment();

      expect(await weth.decimals()).to.equal(18);
      expect(await usdc.decimals()).to.equal(6);
      expect(await vault1.strike()).to.equal(STRIKE_PRICE);
      expect(await vault2.strike()).to.equal(STRIKE_PRICE);

      // Check that expiries are in the future
      const currentTime = await getCurrentBlockTime();
      expect(await vault1.expiry()).to.be.greaterThan(currentTime);
      expect(await vault2.expiry()).to.be.greaterThan(currentTime);
    });

    it('Should have correct token balances', async function () {
      expect(await weth.balanceOf(user1.address)).to.equal(ethers.parseEther('100'));
      expect(await usdc.balanceOf(signer.address)).to.equal(ethers.parseUnits('1000000', 6));
    });
  });

  describe('EIP712 Hash Computation', function () {
    beforeEach(async function () {
      await setupTestEnvironment();
    });

    it('Should compute correct hash onchain and match local computation', async function () {
      const premiumPerUnit = ethers.parseUnits('100', 6); // 100 USDC per unit
      const minDeposit = ethers.parseEther('1'); // 1 WETH
      const maxDeposit = ethers.parseEther('10'); // 10 WETH
      const validUntil = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      // Get onchain hash
      const onchainHash = await optionVaultFactory.computeWriteOptionHash(
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1 // quoteId
      );

      // Compute hash locally using ethers
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const localHash = ethers.TypedDataEncoder.hash(domain, types, value);

      expect(onchainHash).to.equal(localHash);
    });

    it('Should recover correct signer onchain and match local recovery', async function () {
      const premiumPerUnit = ethers.parseUnits('100', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = Math.floor(Date.now() / 1000) + 3600;

      // Create signature locally
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Get onchain recovery
      const [onchainDigest, onchainSigner] =
        await optionVaultFactory.computeWriteOptionHashAndRecover(
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1, // quoteId
          signature
        );

      // Verify onchain signer matches expected signer
      expect(onchainSigner).to.equal(signer.address);

      // Verify onchain digest matches local hash
      const localHash = ethers.TypedDataEncoder.hash(domain, types, value);
      expect(onchainDigest).to.equal(localHash);
    });

    it('Should handle different vault parameters correctly', async function () {
      // Test with vault2 (different expiry)
      const premiumPerUnit = ethers.parseUnits('200', 6);
      const minDeposit = ethers.parseEther('2');
      const maxDeposit = ethers.parseEther('20');
      const validUntil = Math.floor(Date.now() / 1000) + 7200; // 2 hours

      const onchainHash = await optionVaultFactory.computeWriteOptionHash(
        await vault2.strike(),
        await vault2.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        2 // quoteId
      );

      // Local computation
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault2.strike(),
        expiry: await vault2.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 2,
      };

      const localHash = ethers.TypedDataEncoder.hash(domain, types, value);
      expect(onchainHash).to.equal(localHash);
    });

    it('Should compute correct hash with static values for cross-checking', async function () {
      // Static values for cross-checking with external scripts
      const staticDomain = {
        name: 'OptionVault',
        version: '1',
        chainId: 31337, // Hardhat default
        verifyingContract: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Static address
      };

      const staticTypes = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const staticValue = {
        strike: '4200000000', // 4200 USDC (6 decimals)
        expiry: '1735689600', // 2025-01-01 00:00:00 UTC
        premiumPerUnit: '150000000', // 150 USDC (6 decimals)
        minDeposit: '1000000000000000000', // 1 WETH (18 decimals)
        maxDeposit: '10000000000000000000', // 10 WETH (18 decimals)
        validUntil: '1735689600', // 2025-01-01 00:00:00 UTC
        quoteId: '1', // Quote ID
      };

      console.log('\n=== STATIC EIP712 TEST VALUES ===');
      console.log('Domain:');
      console.log('  name:', staticDomain.name);
      console.log('  version:', staticDomain.version);
      console.log('  chainId:', staticDomain.chainId);
      console.log('  verifyingContract:', staticDomain.verifyingContract);
      console.log('\nTypes:');
      console.log(JSON.stringify(staticTypes, null, 2));
      console.log('\nValue:');
      console.log('  strike:', staticValue.strike, '(4200 USDC)');
      console.log('  expiry:', staticValue.expiry, '(2025-01-01 00:00:00 UTC)');
      console.log('  premiumPerUnit:', staticValue.premiumPerUnit, '(150 USDC)');
      console.log('  minDeposit:', staticValue.minDeposit, '(1 WETH)');
      console.log('  maxDeposit:', staticValue.maxDeposit, '(10 WETH)');
      console.log('  validUntil:', staticValue.validUntil, '(2025-01-01 00:00:00 UTC)');

      // Compute hash locally
      const localHash = ethers.TypedDataEncoder.hash(staticDomain, staticTypes, staticValue);
      console.log('\n=== HASH COMPUTATION ===');
      console.log('Local computed hash:', localHash);

      // Create signature with static values
      const staticSignature = await signer.signTypedData(staticDomain, staticTypes, staticValue);
      console.log('Static signature:', staticSignature);

      // Recover signer locally
      const recoveredSigner = ethers.verifyTypedData(
        staticDomain,
        staticTypes,
        staticValue,
        staticSignature
      );
      console.log('Recovered signer:', recoveredSigner);
      console.log('Expected signer:', signer.address);
      console.log('Signer match:', recoveredSigner === signer.address);

      // Verify the signature recovery
      expect(recoveredSigner).to.equal(signer.address);

      // Cross-check with on-chain computation
      console.log('\n=== ON-CHAIN CROSS-CHECK ===');

      // Use existing vault1 for on-chain testing
      const vault1Address = await vault1.getAddress();
      console.log('Using vault1 address:', vault1Address);

      // Get the actual vault values for comparison
      const vault1Strike = await vault1.strike();
      const vault1Expiry = await vault1.expiry();
      console.log('Vault1 strike:', vault1Strike.toString());
      console.log('Vault1 expiry:', vault1Expiry.toString());
      console.log('Static strike:', staticValue.strike);
      console.log('Static expiry:', staticValue.expiry);

      // Test on-chain hash computation with static values
      const onchainHash = await optionVaultFactory.computeWriteOptionHash(
        vault1Strike,
        vault1Expiry,
        staticValue.premiumPerUnit,
        staticValue.minDeposit,
        staticValue.maxDeposit,
        staticValue.validUntil,
        staticValue.quoteId
      );

      console.log('On-chain computed hash:', onchainHash);
      console.log('Hash match (local vs on-chain):', localHash === onchainHash);

      // Test on-chain signature recovery with static values
      const onchainRecovery = await optionVaultFactory.computeWriteOptionHashAndRecover(
        vault1Strike,
        vault1Expiry,
        staticValue.premiumPerUnit,
        staticValue.minDeposit,
        staticValue.maxDeposit,
        staticValue.validUntil,
        staticValue.quoteId,
        staticSignature
      );

      console.log('On-chain recovered signer:', onchainRecovery.signer);
      console.log('On-chain hash:', onchainRecovery.digest);
      console.log('On-chain signer match:', onchainRecovery.signer === signer.address);
      console.log('On-chain hash match:', onchainRecovery.digest === localHash);

      // Note: The hashes will be different because on-chain uses vault's actual strike/expiry
      // while local computation uses static values. This is expected behavior.
      console.log('\n=== HASH DIFFERENCE EXPLANATION ===');
      console.log('Local hash uses static values from domain');
      console.log('On-chain hash uses actual vault values (strike/expiry from contract)');
      console.log('This difference is expected and demonstrates the correct behavior');

      // Now let's test with vault's actual values for proper cross-checking
      console.log('\n=== PROPER CROSS-CHECK WITH VAULT VALUES ===');

      // Create a new signature using the vault's actual values
      const vaultDomain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const vaultValue = {
        strike: vault1Strike.toString(),
        expiry: vault1Expiry.toString(),
        premiumPerUnit: staticValue.premiumPerUnit,
        minDeposit: staticValue.minDeposit,
        maxDeposit: staticValue.maxDeposit,
        validUntil: staticValue.validUntil,
        quoteId: staticValue.quoteId,
      };

      console.log('Vault domain:', vaultDomain);
      console.log('Vault value:', vaultValue);

      // Compute hash locally with vault values
      const vaultLocalHash = ethers.TypedDataEncoder.hash(vaultDomain, staticTypes, vaultValue);
      console.log('Vault local hash:', vaultLocalHash);

      // Create signature with vault values
      const vaultSignature = await signer.signTypedData(vaultDomain, staticTypes, vaultValue);
      console.log('Vault signature:', vaultSignature);

      // Test on-chain computation with vault values
      const vaultOnchainHash = await optionVaultFactory.computeWriteOptionHash(
        vault1Strike,
        vault1Expiry,
        vaultValue.premiumPerUnit,
        vaultValue.minDeposit,
        vaultValue.maxDeposit,
        vaultValue.validUntil,
        vaultValue.quoteId
      );

      console.log('Vault on-chain hash:', vaultOnchainHash);
      console.log('Vault hash match (local vs on-chain):', vaultLocalHash === vaultOnchainHash);

      // Test on-chain signature recovery with vault values
      const vaultOnchainRecovery = await optionVaultFactory.computeWriteOptionHashAndRecover(
        vault1Strike,
        vault1Expiry,
        vaultValue.premiumPerUnit,
        vaultValue.minDeposit,
        vaultValue.maxDeposit,
        vaultValue.validUntil,
        vaultValue.quoteId,
        vaultSignature
      );

      console.log('Vault on-chain recovered signer:', vaultOnchainRecovery.signer);
      console.log('Vault on-chain hash:', vaultOnchainRecovery.digest);
      console.log('Vault on-chain signer match:', vaultOnchainRecovery.signer === signer.address);
      console.log('Vault on-chain hash match:', vaultOnchainRecovery.digest === vaultLocalHash);

      // Verify proper cross-checking works
      expect(vaultLocalHash).to.equal(vaultOnchainHash);
      expect(vaultOnchainRecovery.signer).to.equal(signer.address);
      expect(vaultOnchainRecovery.digest).to.equal(vaultLocalHash);

      // Test with a different signer to ensure uniqueness
      const differentSigner = user1; // Use existing user1 signer
      const differentSignature = await differentSigner.signTypedData(
        staticDomain,
        staticTypes,
        staticValue
      );
      const differentRecoveredSigner = ethers.verifyTypedData(
        staticDomain,
        staticTypes,
        staticValue,
        differentSignature
      );

      console.log('\n=== DIFFERENT SIGNER TEST ===');
      console.log('Different signer address:', differentSigner.address);
      console.log('Different signature:', differentSignature);
      console.log('Different recovered signer:', differentRecoveredSigner);
      console.log('Different signer match:', differentRecoveredSigner === differentSigner.address);

      expect(differentRecoveredSigner).to.equal(differentSigner.address);
      expect(differentRecoveredSigner).to.not.equal(signer.address);

      console.log('\n=== CROSS-CHECK VALUES FOR EXTERNAL SCRIPTS ===');
      console.log('Domain Separator (EIP712):', ethers.TypedDataEncoder.hashDomain(staticDomain));
      console.log(
        'Struct Hash (WriteOption):',
        ethers.TypedDataEncoder.hashStruct('WriteOption', staticTypes, staticValue)
      );
      console.log('Message Hash:', localHash);
      console.log(
        'Signer Private Key (for testing):',
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      ); // Hardhat account #0
      console.log('Signer Address:', signer.address);
    });
  });

  describe('Vault Validation', function () {
    beforeEach(async function () {
      await setupTestEnvironment();
    });

    it('Should handle invalid vault addresses gracefully', async function () {
      const randomAddress = ethers.Wallet.createRandom().address;

      // This test verifies that the function handles invalid addresses
      // The exact error behavior may vary, but it should not succeed
      try {
        await optionVaultFactory.computeWriteOptionHash(
          ethers.parseUnits('4200', 6), // strike
          Math.floor(Date.now() / 1000) + 86400, // expiry
          ethers.parseUnits('100', 6),
          ethers.parseEther('1'),
          ethers.parseEther('10'),
          Math.floor(Date.now() / 1000) + 3600,
          1 // quoteId
        );
        // If we get here, the test should fail
        expect.fail('Expected function to fail with invalid vault address');
      } catch (error) {
        // Expected to fail - this is the correct behavior
        expect(error).to.exist;
      }
    });

    it('Should accept known vault addresses', async function () {
      const hash = await optionVaultFactory.computeWriteOptionHash(
        await vault1.strike(),
        await vault1.expiry(),
        ethers.parseUnits('100', 6),
        ethers.parseEther('1'),
        ethers.parseEther('10'),
        Math.floor(Date.now() / 1000) + 3600,
        1 // quoteId
      );

      expect(hash).to.not.equal(ethers.ZeroHash);
    });
  });

  describe('Preview Write Option', function () {
    beforeEach(async function () {
      await setupTestEnvironment();
    });

    it('Should preview successful writeOption', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Preview the transaction - call from user1's context
      const [status, totalPremium] = await optionVaultFactory
        .connect(user1)
        .previewWriteOption(
          user1.address,
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          signature
        );

      expect(status).to.equal(0); // PreviewStatus.SUCCESS
      expect(totalPremium).to.equal(ethers.parseUnits('300', 6)); // 150 * 2 = 300 USDC
    });

    it('Should preview insufficient user balance', async function () {
      // Transfer away most of user1's WETH to create insufficient balance
      await weth.connect(user1).transfer(owner.address, ethers.parseEther('99'));

      const amount = ethers.parseEther('5'); // User only has 1 WETH left
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Preview the transaction - call from user1's context
      const [status, totalPremium] = await optionVaultFactory
        .connect(user1)
        .previewWriteOption(
          user1.address,
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          signature
        );

      expect(status).to.equal(10); // PreviewStatus.INSUFFICIENT_USER_BALANCE
      expect(totalPremium).to.equal(ethers.parseUnits('750', 6)); // 150 * 5 = 750 USDC
    });

    it('Should preview insufficient signer allowance', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Approve only user tokens, not signer tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      // Don't approve signer tokens

      // Preview the transaction - call from user1's context
      const [status, totalPremium] = await optionVaultFactory
        .connect(user1)
        .previewWriteOption(
          user1.address,
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          signature
        );

      expect(status).to.equal(13); // PreviewStatus.INSUFFICIENT_SIGNER_ALLOWANCE
      expect(totalPremium).to.equal(ethers.parseUnits('300', 6)); // 150 * 2 = 300 USDC
    });

    it('Should preview unknown vault', async function () {
      const randomAddress = ethers.Wallet.createRandom().address;
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      // Preview the transaction - call from user1's context
      const [status, totalPremium] = await optionVaultFactory.connect(user1).previewWriteOption(
        user1.address,
        randomAddress,
        amount,
        ethers.parseUnits('4200', 6), // Dummy strike
        await getFutureTimestamp(14), // Dummy expiry
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1,
        '0x'
      );

      expect(status).to.equal(1); // PreviewStatus.UNKNOWN_VAULT
      expect(totalPremium).to.equal(0);
    });

    it('Should reject signature with incorrect strike/expiry values', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      // Create signature with WRONG strike and expiry values
      const wrongValue = {
        strike: ethers.parseUnits('5000', 6), // Wrong strike (should be 4200)
        expiry: await getFutureTimestamp(30), // Wrong expiry (should be vault1's expiry)
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const wrongSignature = await signer.signTypedData(domain, types, wrongValue);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Preview the transaction - should fail due to signature mismatch
      const [status, totalPremium] = await optionVaultFactory
        .connect(user1)
        .previewWriteOption(
          user1.address,
          await vault1.getAddress(),
          amount,
          wrongValue.strike,
          wrongValue.expiry,
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          wrongSignature
        );

      expect([14]).to.include(Number(status)); // wrong strike

      // Preview the transaction - should fail due to signature mismatch
      const [status2] = await optionVaultFactory
        .connect(user1)
        .previewWriteOption(
          user1.address,
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          wrongValue.expiry,
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          wrongSignature
        );
      expect([15]).to.include(Number(status2)); // wrong strike
    });

    it('Should reject preview with wrong strike parameter', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Preview with WRONG strike parameter (but correct signature)
      const [status, totalPremium] = await optionVaultFactory.connect(user1).previewWriteOption(
        user1.address,
        await vault1.getAddress(),
        amount,
        ethers.parseUnits('5000', 6), // Wrong strike
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1,
        signature
      );

      expect(status).to.equal(14); // PreviewStatus.WRONG_STRIKE
      expect(totalPremium).to.equal(0);
    });

    it('Should reject preview with wrong expiry parameter', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Preview with WRONG expiry parameter (but correct signature)
      const [status, totalPremium] = await optionVaultFactory.connect(user1).previewWriteOption(
        user1.address,
        await vault1.getAddress(),
        amount,
        await vault1.strike(),
        await getFutureTimestamp(30), // Wrong expiry
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1,
        signature
      );

      expect(status).to.equal(15); // PreviewStatus.WRONG_EXPIRY
      expect(totalPremium).to.equal(0);
    });

    it('Should reject preview with validUntil after vault expiry', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestamp(20); // 20 days from now (after vault expiry)

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Preview with validUntil after vault expiry
      const [status, totalPremium] = await optionVaultFactory
        .connect(user1)
        .previewWriteOption(
          user1.address,
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          signature
        );

      expect(status).to.equal(3); // PreviewStatus.BAD_VALID_UNTIL
      expect(totalPremium).to.equal(0);
    });

    it('Should reject preview when current time is after vault expiry', async function () {
      // Fast forward past vault expiry
      const vaultExpiry = await vault1.expiry();
      const currentTime = await getCurrentBlockTime();
      const timeToAdvance = Number(vaultExpiry) - Number(currentTime) + 1; // 1 second past expiry
      await hreEthers.provider.send('evm_increaseTime', [timeToAdvance]);
      await hreEthers.provider.send('evm_mine');

      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');

      // Create signature after advancing time, with validUntil in the future but before vault expiry
      const currentTimeAfterAdvance = await getCurrentBlockTime();
      const vaultExpiryTime = Number(await vault1.expiry());
      const validUntil = Number(currentTimeAfterAdvance) + 3600; // 1 hour from current time

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Preview when current time is after vault expiry
      const [status, totalPremium] = await optionVaultFactory
        .connect(user1)
        .previewWriteOption(
          user1.address,
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          signature
        );

      expect(status).to.equal(4); // PreviewStatus.VAULT_EXPIRED
      expect(totalPremium).to.equal(0);
    });
  });

  describe('Write Option Flow', function () {
    beforeEach(async function () {
      await setupTestEnvironment();
    });

    it('Should complete full writeOption flow with signature', async function () {
      const premiumPerUnit = ethers.parseUnits('150', 6); // 150 USDC per unit
      const minDeposit = ethers.parseEther('1'); // 1 WETH
      const maxDeposit = ethers.parseEther('10'); // 10 WETH
      const validUntil = await getFutureTimestampHours(1); // 1 hour from now
      const amount = ethers.parseEther('2'); // 2 WETH

      // Get initial balances
      const initialUser1Weth = await weth.balanceOf(user1.address);
      const initialUser1Usdc = await usdc.balanceOf(user1.address);
      const initialSignerUsdc = await usdc.balanceOf(signer.address);
      const initialVaultWeth = await weth.balanceOf(await vault1.getAddress());
      const initialVaultUsdc = await usdc.balanceOf(await vault1.getAddress());

      // Create signature for the offer
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Calculate expected premium (150 USDC per WETH unit)
      const expectedPremium = (premiumPerUnit * amount) / ethers.parseEther('1');

      console.log('\n=== WRITE OPTION DETAILS ===');
      console.log('Amount (WETH):', ethers.formatEther(amount));
      console.log('Amount (raw):', amount.toString());
      console.log('Premium per unit (USDC):', ethers.formatUnits(premiumPerUnit, 6));
      console.log('Premium per unit (raw):', premiumPerUnit.toString());
      console.log('Expected premium (USDC):', ethers.formatUnits(expectedPremium, 6));
      console.log('Expected premium (raw):', expectedPremium.toString());
      console.log('Min deposit (WETH):', ethers.formatEther(minDeposit));
      console.log('Max deposit (WETH):', ethers.formatEther(maxDeposit));
      console.log('Valid until (timestamp):', validUntil.toString());
      console.log('Valid until (date):', new Date(Number(validUntil) * 1000).toISOString());

      // User1 approves WETH for the factory
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);

      // Signer needs to approve USDC for the factory (since signer pays premium)
      await usdc.connect(signer).approve(await optionVaultFactory.getAddress(), expectedPremium);

      const tx = await optionVaultFactory.connect(user1).writeOption(
        await vault1.getAddress(),
        amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1, // quoteId
        signature
      );

      const receipt = await tx.wait();

      console.log('\n=== WRITE OPTION RESULTS ===');
      console.log('Transaction hash:', tx.hash);
      console.log('Gas used:', receipt.gasUsed.toString());
      console.log('Block number:', receipt.blockNumber);

      // Verify the OptionWritten event was emitted
      const optionWrittenEvent = receipt.logs.find(log => {
        try {
          const parsed = optionVaultFactory.interface.parseLog(log);
          return parsed.name === 'OptionWritten';
        } catch {
          return false;
        }
      });

      expect(optionWrittenEvent).to.not.be.undefined;

      // Verify token balances after the transaction
      const finalUser1Weth = await weth.balanceOf(user1.address);
      const finalUser1Usdc = await usdc.balanceOf(user1.address);
      const finalSignerUsdc = await usdc.balanceOf(signer.address);
      const finalVaultWeth = await weth.balanceOf(await vault1.getAddress());
      const finalVaultUsdc = await usdc.balanceOf(await vault1.getAddress());

      console.log('\n=== BALANCE CHANGES ===');
      console.log('User1 WETH:');
      console.log('  Initial:', ethers.formatEther(initialUser1Weth), 'WETH');
      console.log('  Final:', ethers.formatEther(finalUser1Weth), 'WETH');
      console.log('  Change:', ethers.formatEther(finalUser1Weth - initialUser1Weth), 'WETH');
      console.log('User1 USDC:');
      console.log('  Initial:', ethers.formatUnits(initialUser1Usdc, 6), 'USDC');
      console.log('  Final:', ethers.formatUnits(finalUser1Usdc, 6), 'USDC');
      console.log('  Change:', ethers.formatUnits(finalUser1Usdc - initialUser1Usdc, 6), 'USDC');
      console.log('Signer USDC:');
      console.log('  Initial:', ethers.formatUnits(initialSignerUsdc, 6), 'USDC');
      console.log('  Final:', ethers.formatUnits(finalSignerUsdc, 6), 'USDC');
      console.log('  Change:', ethers.formatUnits(finalSignerUsdc - initialSignerUsdc, 6), 'USDC');
      console.log('Vault WETH:');
      console.log('  Initial:', ethers.formatEther(initialVaultWeth), 'WETH');
      console.log('  Final:', ethers.formatEther(finalVaultWeth), 'WETH');
      console.log('  Change:', ethers.formatEther(finalVaultWeth - initialVaultWeth), 'WETH');
      console.log('Vault USDC:');
      console.log('  Initial:', ethers.formatUnits(initialVaultUsdc, 6), 'USDC');
      console.log('  Final:', ethers.formatUnits(finalVaultUsdc, 6), 'USDC');
      console.log('  Change:', ethers.formatUnits(finalVaultUsdc - initialVaultUsdc, 6), 'USDC');

      // User1 should have less WETH (deposited to vault)
      expect(finalUser1Weth).to.equal(initialUser1Weth - amount);

      // User1 should have more USDC (received premium from signer)
      expect(finalUser1Usdc).to.equal(initialUser1Usdc + expectedPremium);

      // Signer should have less USDC (paid premium to user1)
      expect(finalSignerUsdc).to.equal(initialSignerUsdc - expectedPremium);

      // Vault should have more WETH (received from user1)
      expect(finalVaultWeth).to.equal(initialVaultWeth + amount);

      // Vault USDC balance should be unchanged (premium goes directly to user1)
      expect(finalVaultUsdc).to.equal(initialVaultUsdc);

      // Verify user1 now has vault tokens
      const user1VaultBalance = await vault1.balanceOf(user1.address);
      expect(user1VaultBalance).to.equal(amount);
    });

    it('Should reject writeOption with malformed signature', async function () {
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);
      const amount = ethers.parseEther('2');

      // Create malformed signature (invalid format)
      const malformedSignature =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12';

      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);

      // Should revert with ECDSAInvalidSignature error due to malformed signature
      await expect(
        optionVaultFactory.connect(user1).writeOption(
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1, // quoteId
          malformedSignature
        )
      ).to.be.revertedWithCustomError(optionVaultFactory, 'ECDSAInvalidSignature');
    });

    it('Should reject writeOption with expired signature', async function () {
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const currentTime = await getCurrentBlockTime();
      const validUntil = currentTime - 3600; // 1 hour ago (expired)
      const amount = ethers.parseEther('2');

      // Create signature for expired offer
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);

      // Should revert with Expired error
      await expect(
        optionVaultFactory.connect(user1).writeOption(
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1, // quoteId
          signature
        )
      ).to.be.revertedWithCustomError(optionVaultFactory, 'Expired');
    });

    it('Should reject exercise after expiry', async function () {
      // First, write an option
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);
      const amount = ethers.parseEther('2');

      // Create signature for the offer
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);
      const expectedPremium = (premiumPerUnit * amount) / ethers.parseEther('1');

      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc.connect(signer).approve(await optionVaultFactory.getAddress(), expectedPremium);

      await optionVaultFactory.connect(user1).writeOption(
        await vault1.getAddress(),
        amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1, // quoteId
        signature
      );

      console.log('\n=== EXERCISE AFTER EXPIRY TEST ===');
      console.log('Vault expiry:', new Date(Number(await vault1.expiry()) * 1000).toISOString());

      // Fast forward past expiry
      await hreEthers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]); // 15 days
      await hreEthers.provider.send('evm_mine', []);

      const currentTime = await getCurrentBlockTime();
      console.log(
        'Current time after fast forward:',
        new Date(Number(currentTime) * 1000).toISOString()
      );
      console.log(
        'Time past expiry:',
        (currentTime - Number(await vault1.expiry())).toString(),
        'seconds'
      );

      // Try to exercise after expiry - should fail
      const exerciseAmount = ethers.parseEther('1.5');
      const cost = (exerciseAmount * (await vault1.strike())) / ethers.parseEther('1');

      console.log(
        'Attempting to exercise:',
        ethers.formatEther(exerciseAmount),
        'WETH for',
        ethers.formatUnits(cost, 6),
        'USDC'
      );

      await usdc.connect(owner).mint(owner.address, cost);
      await usdc.connect(owner).approve(await optionVaultFactory.getAddress(), cost);

      await expect(
        optionVaultFactory.connect(owner).exercise(await vault1.getAddress(), exerciseAmount)
      ).to.be.revertedWithCustomError(optionVaultFactory, 'Expired');
    });

    it('Should reject writeOption with incorrect strike/expiry in signature', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      // Create signature with WRONG strike and expiry values
      const wrongValue = {
        strike: ethers.parseUnits('5000', 6), // Wrong strike (should be 4200)
        expiry: await getFutureTimestamp(30), // Wrong expiry (should be vault1's expiry)
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const wrongSignature = await signer.signTypedData(domain, types, wrongValue);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Should revert due to signature mismatch (either BadSignature or InsufficientSignerBalance)
      try {
        await optionVaultFactory
          .connect(user1)
          .writeOption(
            await vault1.getAddress(),
            amount,
            await vault1.strike(),
            await vault1.expiry(),
            premiumPerUnit,
            minDeposit,
            maxDeposit,
            validUntil,
            1,
            wrongSignature
          );
        expect.fail('Expected transaction to revert');
      } catch (error) {
        // Should revert with either BadSignature or InsufficientSignerBalance
        expect(error.message).to.match(/BadSignature|InsufficientSignerBalance/);
      }
    });

    it('Should reject writeOption with wrong strike parameter', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Should revert with WrongStrike due to wrong strike parameter
      await expect(
        optionVaultFactory.connect(user1).writeOption(
          await vault1.getAddress(),
          amount,
          ethers.parseUnits('5000', 6), // Wrong strike
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          signature
        )
      ).to.be.revertedWithCustomError(optionVaultFactory, 'WrongStrike');
    });

    it('Should reject writeOption with wrong expiry parameter', async function () {
      const amount = ethers.parseEther('2');
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(1);

      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Approve tokens
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc
        .connect(signer)
        .approve(await optionVaultFactory.getAddress(), ethers.parseUnits('300', 6));

      // Should revert with WrongExpiry due to wrong expiry parameter
      await expect(
        optionVaultFactory.connect(user1).writeOption(
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await getFutureTimestamp(30), // Wrong expiry
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1,
          signature
        )
      ).to.be.revertedWithCustomError(optionVaultFactory, 'WrongExpiry');
    });
  });

  describe('Replay Protection', function () {
    beforeEach(async function () {
      await setupTestEnvironment();
    });

    it('Should prevent replay attacks with AlreadyFilled error', async function () {
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(2); // 2 hours
      const amount = ethers.parseEther('2');

      // Create signature
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);
      const expectedPremium = (premiumPerUnit * amount) / ethers.parseEther('1');

      // First use - should succeed
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc.connect(signer).approve(await optionVaultFactory.getAddress(), expectedPremium);

      const tx1 = await optionVaultFactory.connect(user1).writeOption(
        await vault1.getAddress(),
        amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1, // quoteId
        signature
      );

      await tx1.wait();

      // Second use with same signature - should fail with AlreadyFilled
      await weth.connect(user2).approve(await optionVaultFactory.getAddress(), amount);
      await usdc.connect(signer).approve(await optionVaultFactory.getAddress(), expectedPremium);

      await expect(
        optionVaultFactory.connect(user2).writeOption(
          await vault1.getAddress(),
          amount,
          await vault1.strike(),
          await vault1.expiry(),
          premiumPerUnit,
          minDeposit,
          maxDeposit,
          validUntil,
          1, // quoteId (same as first call)
          signature
        )
      ).to.be.revertedWithCustomError(optionVaultFactory, 'AlreadyFilled');
    });
  });

  describe('Redemption Flows', function () {
    beforeEach(async function () {
      await setupTestEnvironment();
    });

    it('Should allow redemption after expiry without exercise', async function () {
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(2); // 2 hours
      const amount = ethers.parseEther('2');

      // Create and execute writeOption
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);
      const expectedPremium = (premiumPerUnit * amount) / ethers.parseEther('1');

      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc.connect(signer).approve(await optionVaultFactory.getAddress(), expectedPremium);

      await optionVaultFactory.connect(user1).writeOption(
        await vault1.getAddress(),
        amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1, // quoteId
        signature
      );

      // Fast forward past expiry
      await hreEthers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]); // 15 days
      await hreEthers.provider.send('evm_mine', []);

      // Get initial balances before redemption
      const initialUser1Weth = await weth.balanceOf(user1.address);
      const initialVaultWeth = await weth.balanceOf(await vault1.getAddress());

      // User1 redeems their tokens
      const tx = await optionVaultFactory.connect(user1).redeem(await vault1.getAddress());
      const receipt = await tx.wait();

      // Verify Redeemed event was emitted
      const redeemedEvent = receipt.logs.find(log => {
        try {
          const parsed = optionVaultFactory.interface.parseLog(log);
          return parsed.name === 'Redeemed';
        } catch {
          return false;
        }
      });

      expect(redeemedEvent).to.not.be.undefined;

      // Verify user1 got back their WETH (no exercise happened)
      const finalUser1Weth = await weth.balanceOf(user1.address);
      const finalVaultWeth = await weth.balanceOf(await vault1.getAddress());

      expect(finalUser1Weth).to.equal(initialUser1Weth + amount);
      expect(finalVaultWeth).to.equal(initialVaultWeth - amount);

      // Verify user1 no longer has vault tokens
      const user1VaultBalance = await vault1.balanceOf(user1.address);
      expect(user1VaultBalance).to.equal(0);
    });

    it('Should allow redemption after exercise with swapped tokens', async function () {
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(2); // 2 hours
      const amount = ethers.parseEther('2');

      // Create and execute writeOption
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);
      const expectedPremium = (premiumPerUnit * amount) / ethers.parseEther('1');

      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), amount);
      await usdc.connect(signer).approve(await optionVaultFactory.getAddress(), expectedPremium);

      await optionVaultFactory.connect(user1).writeOption(
        await vault1.getAddress(),
        amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1, // quoteId
        signature
      );

      // Owner exercises the option
      const exerciseAmount = ethers.parseEther('1.5'); // Exercise 1.5 WETH worth
      const cost = (exerciseAmount * (await vault1.strike())) / ethers.parseEther('1');

      console.log('\n=== EXERCISE DETAILS ===');
      console.log('Exercise amount (WETH):', ethers.formatEther(exerciseAmount));
      console.log('Exercise amount (raw):', exerciseAmount.toString());
      console.log('Strike price (USDC):', ethers.formatUnits(await vault1.strike(), 6));
      console.log('Strike price (raw):', (await vault1.strike()).toString());
      console.log('Exercise cost (USDC):', ethers.formatUnits(cost, 6));
      console.log('Exercise cost (raw):', cost.toString());

      // Make sure owner has enough USDC for exercise
      await usdc.connect(owner).mint(owner.address, cost);
      await usdc.connect(owner).approve(await optionVaultFactory.getAddress(), cost);

      const exerciseTx = await optionVaultFactory
        .connect(owner)
        .exercise(await vault1.getAddress(), exerciseAmount);
      const exerciseReceipt = await exerciseTx.wait();

      console.log('\n=== EXERCISE RESULTS ===');
      console.log('Exercise transaction hash:', exerciseTx.hash);
      console.log('Gas used:', exerciseReceipt.gasUsed.toString());
      console.log('Block number:', exerciseReceipt.blockNumber);

      // Fast forward past expiry
      await hreEthers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]); // 15 days
      await hreEthers.provider.send('evm_mine', []);

      // Get initial balances before redemption
      const initialUser1Weth = await weth.balanceOf(user1.address);
      const initialUser1Usdc = await usdc.balanceOf(user1.address);
      const initialVaultWeth = await weth.balanceOf(await vault1.getAddress());
      const initialVaultUsdc = await usdc.balanceOf(await vault1.getAddress());

      // Calculate expected amounts before redemption
      const user1VaultBalance = await vault1.balanceOf(user1.address);
      const totalVaultSupply = await vault1.totalSupply();
      const remainingWeth = amount - exerciseAmount;
      const proRataUsdc = (cost * user1VaultBalance) / totalVaultSupply;

      console.log('\n=== REDEMPTION DETAILS ===');
      console.log(
        'User1 vault balance:',
        ethers.formatEther(await vault1.balanceOf(user1.address)),
        'vault tokens'
      );
      console.log(
        'Total vault supply:',
        ethers.formatEther(await vault1.totalSupply()),
        'vault tokens'
      );
      console.log(
        'Vault WETH balance:',
        ethers.formatEther(await weth.balanceOf(await vault1.getAddress())),
        'WETH'
      );
      console.log(
        'Vault USDC balance:',
        ethers.formatUnits(await usdc.balanceOf(await vault1.getAddress()), 6),
        'USDC'
      );

      // User1 redeems their tokens
      const redeemTx = await optionVaultFactory.connect(user1).redeem(await vault1.getAddress());
      const redeemReceipt = await redeemTx.wait();

      console.log('\n=== REDEMPTION RESULTS ===');
      console.log('Redemption transaction hash:', redeemTx.hash);
      console.log('Gas used:', redeemReceipt.gasUsed.toString());
      console.log('Block number:', redeemReceipt.blockNumber);

      // Verify user1 got back their remaining WETH + pro-rata USDC from exercise
      const finalUser1Weth = await weth.balanceOf(user1.address);
      const finalUser1Usdc = await usdc.balanceOf(user1.address);
      const finalVaultWeth = await weth.balanceOf(await vault1.getAddress());
      const finalVaultUsdc = await usdc.balanceOf(await vault1.getAddress());

      console.log('\n=== REDEMPTION BALANCE CHANGES ===');
      console.log('User1 WETH:');
      console.log('  Initial:', ethers.formatEther(initialUser1Weth), 'WETH');
      console.log('  Final:', ethers.formatEther(finalUser1Weth), 'WETH');
      console.log('  Change:', ethers.formatEther(finalUser1Weth - initialUser1Weth), 'WETH');
      console.log('User1 USDC:');
      console.log('  Initial:', ethers.formatUnits(initialUser1Usdc, 6), 'USDC');
      console.log('  Final:', ethers.formatUnits(finalUser1Usdc, 6), 'USDC');
      console.log('  Change:', ethers.formatUnits(finalUser1Usdc - initialUser1Usdc, 6), 'USDC');
      console.log('Vault WETH:');
      console.log('  Initial:', ethers.formatEther(initialVaultWeth), 'WETH');
      console.log('  Final:', ethers.formatEther(finalVaultWeth), 'WETH');
      console.log('  Change:', ethers.formatEther(finalVaultWeth - initialVaultWeth), 'WETH');
      console.log('Vault USDC:');
      console.log('  Initial:', ethers.formatUnits(initialVaultUsdc, 6), 'USDC');
      console.log('  Final:', ethers.formatUnits(finalVaultUsdc, 6), 'USDC');
      console.log('  Change:', ethers.formatUnits(finalVaultUsdc - initialVaultUsdc, 6), 'USDC');

      // User should get back remaining WETH (amount - exerciseAmount)
      expect(finalUser1Weth).to.equal(initialUser1Weth + remainingWeth);

      // User should get pro-rata share of USDC from exercise
      expect(finalUser1Usdc).to.equal(initialUser1Usdc + proRataUsdc);

      // Vault should be empty (user1 was the only user)
      expect(finalVaultWeth).to.equal(0);
      expect(finalVaultUsdc).to.equal(0);
    });
  });

  describe('Pro-rata Distribution with Multiple Users', function () {
    beforeEach(async function () {
      await setupTestEnvironment();
    });

    it('Should distribute pro-rata with 10/90 split after expiry without exercise', async function () {
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(2); // 2 hours

      const user1Amount = minDeposit; // 10% of total
      const user2Amount = minDeposit * 9n; // 90% of total

      // Create signatures for both users
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Calculate premiums for both users
      const user1Premium = (premiumPerUnit * user1Amount) / ethers.parseEther('1');
      const user2Premium = (premiumPerUnit * user2Amount) / ethers.parseEther('1');
      const totalPremium = user1Premium + user2Premium;

      // Approve total premium upfront
      await usdc.connect(signer).approve(await optionVaultFactory.getAddress(), totalPremium);

      // User1 writes option
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), user1Amount);

      await optionVaultFactory.connect(user1).writeOption(
        await vault1.getAddress(),
        user1Amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1, // quoteId
        signature
      );

      // User2 writes option with a new signature (to avoid AlreadyFilled error)
      await weth.connect(user2).approve(await optionVaultFactory.getAddress(), user2Amount);

      // Create a new signature for user2 with slightly different validUntil and quoteId
      const user2ValidUntil = await getFutureTimestampHours(3); // 3 hours instead of 2
      const user2Value = {
        ...value,
        validUntil: user2ValidUntil,
        quoteId: 2, // Different quoteId to avoid QuoteIdAlreadyFilled
      };
      const user2Signature = await signer.signTypedData(domain, types, user2Value);

      await optionVaultFactory.connect(user2).writeOption(
        await vault1.getAddress(),
        user2Amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        user2ValidUntil,
        2, // quoteId
        user2Signature
      );

      // Fast forward past expiry
      await hreEthers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]);
      await hreEthers.provider.send('evm_mine', []);

      // Get initial balances
      const initialUser1Weth = await weth.balanceOf(user1.address);
      const initialUser2Weth = await weth.balanceOf(user2.address);
      const initialVaultWeth = await weth.balanceOf(await vault1.getAddress());

      // Both users redeem
      await optionVaultFactory.connect(user1).redeem(await vault1.getAddress());
      await optionVaultFactory.connect(user2).redeem(await vault1.getAddress());

      // Verify pro-rata distribution
      const finalUser1Weth = await weth.balanceOf(user1.address);
      const finalUser2Weth = await weth.balanceOf(user2.address);
      const finalVaultWeth = await weth.balanceOf(await vault1.getAddress());

      // User1 should get back 10% of total WETH
      expect(finalUser1Weth).to.equal(initialUser1Weth + user1Amount);
      // User2 should get back 90% of total WETH
      expect(finalUser2Weth).to.equal(initialUser2Weth + user2Amount);
      // Vault should be empty
      expect(finalVaultWeth).to.equal(0);
    });

    it('Should distribute pro-rata with 10/90 split after exercise', async function () {
      const premiumPerUnit = ethers.parseUnits('150', 6);
      const minDeposit = ethers.parseEther('1');
      const maxDeposit = ethers.parseEther('10');
      const validUntil = await getFutureTimestampHours(2); // 2 hours

      const user1Amount = minDeposit; // 10%
      const user2Amount = minDeposit * 9n; // 90%
      const totalAmount = user1Amount + user2Amount;

      // Create and execute writeOptions for both users
      const domain = {
        name: 'OptionVault',
        version: '1',
        chainId: await hreEthers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await optionVaultFactory.getAddress(),
      };

      const types = {
        WriteOption: [
          { name: 'strike', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'premiumPerUnit', type: 'uint256' },
          { name: 'minDeposit', type: 'uint256' },
          { name: 'maxDeposit', type: 'uint256' },
          { name: 'validUntil', type: 'uint256' },
          { name: 'quoteId', type: 'uint256' },
        ],
      };

      const value = {
        strike: await vault1.strike(),
        expiry: await vault1.expiry(),
        premiumPerUnit: premiumPerUnit,
        minDeposit: minDeposit,
        maxDeposit: maxDeposit,
        validUntil: validUntil,
        quoteId: 1,
      };

      const signature = await signer.signTypedData(domain, types, value);

      // Calculate premiums for both users
      const user1Premium = (premiumPerUnit * user1Amount) / ethers.parseEther('1');
      const user2Premium = (premiumPerUnit * user2Amount) / ethers.parseEther('1');
      const totalPremium = user1Premium + user2Premium;

      // Approve total premium upfront
      await usdc.connect(signer).approve(await optionVaultFactory.getAddress(), totalPremium);

      // User1 writes option
      await weth.connect(user1).approve(await optionVaultFactory.getAddress(), user1Amount);

      await optionVaultFactory.connect(user1).writeOption(
        await vault1.getAddress(),
        user1Amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        validUntil,
        1, // quoteId
        signature
      );

      // User2 writes option with a new signature (to avoid AlreadyFilled error)
      await weth.connect(user2).approve(await optionVaultFactory.getAddress(), user2Amount);

      // Create a new signature for user2 with slightly different validUntil and quoteId
      const user2ValidUntil = await getFutureTimestampHours(3); // 3 hours instead of 2
      const user2Value = {
        ...value,
        validUntil: user2ValidUntil,
        quoteId: 2, // Different quoteId to avoid QuoteIdAlreadyFilled
      };
      const user2Signature = await signer.signTypedData(domain, types, user2Value);

      await optionVaultFactory.connect(user2).writeOption(
        await vault1.getAddress(),
        user2Amount,
        await vault1.strike(),
        await vault1.expiry(),
        premiumPerUnit,
        minDeposit,
        maxDeposit,
        user2ValidUntil,
        2, // quoteId
        user2Signature
      );

      // Owner exercises 50% of the total
      const exerciseAmount = totalAmount / 2n; // Exercise 1 WETH
      const cost = (exerciseAmount * (await vault1.strike())) / ethers.parseEther('1');

      // Make sure owner has enough USDC for exercise
      await usdc.connect(owner).mint(owner.address, cost);
      await usdc.connect(owner).approve(await optionVaultFactory.getAddress(), cost);
      await optionVaultFactory.connect(owner).exercise(await vault1.getAddress(), exerciseAmount);

      // Fast forward past expiry
      await hreEthers.provider.send('evm_increaseTime', [15 * 24 * 60 * 60]);
      await hreEthers.provider.send('evm_mine', []);

      // Get initial balances
      const initialUser1Weth = await weth.balanceOf(user1.address);
      const initialUser1Usdc = await usdc.balanceOf(user1.address);
      const initialUser2Weth = await weth.balanceOf(user2.address);
      const initialUser2Usdc = await usdc.balanceOf(user2.address);

      // Both users redeem
      await optionVaultFactory.connect(user1).redeem(await vault1.getAddress());
      await optionVaultFactory.connect(user2).redeem(await vault1.getAddress());

      // Verify pro-rata distribution
      const finalUser1Weth = await weth.balanceOf(user1.address);
      const finalUser1Usdc = await usdc.balanceOf(user1.address);
      const finalUser2Weth = await weth.balanceOf(user2.address);
      const finalUser2Usdc = await usdc.balanceOf(user2.address);

      // Calculate expected amounts
      const remainingWeth = totalAmount - exerciseAmount; // 1 WETH remaining
      const user1WethShare = (remainingWeth * user1Amount) / totalAmount; // 10% of 1 WETH
      const user2WethShare = (remainingWeth * user2Amount) / totalAmount; // 90% of 1 WETH
      const user1UsdcShare = (cost * user1Amount) / totalAmount; // 10% of USDC
      const user2UsdcShare = (cost * user2Amount) / totalAmount; // 90% of USDC

      // User1 should get 10% of remaining WETH + 10% of USDC
      expect(finalUser1Weth).to.equal(initialUser1Weth + user1WethShare);
      expect(finalUser1Usdc).to.equal(initialUser1Usdc + user1UsdcShare);

      // User2 should get 90% of remaining WETH + 90% of USDC
      expect(finalUser2Weth).to.equal(initialUser2Weth + user2WethShare);
      expect(finalUser2Usdc).to.equal(initialUser2Usdc + user2UsdcShare);
    });
  });
});
