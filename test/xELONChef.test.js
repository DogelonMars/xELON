const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time, deployTo} = require("./utilities");

describe("xELONChef", function() {
    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const MINTER_ROLE = ethers.utils.id("MINTER_ROLE");

    before(async function() {
        [this.owner, this.alice, this.bob, this.carol, _, this.minter] = await ethers.getSigners();

        this.xELONChef = await ethers.getContractFactory("xELONChef");
        this.xELONToken = await ethers.getContractFactory("xELONToken");
        this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
        this.elonTokenAddress = "0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3"
    });

    it("should set correct state variables", async function() {
        // deploy chef
        this.chef = await this.xELONChef.deploy("1000", "0");
        console.log('this.chef:', this.chef)
        await this.chef.deployed();

        this.xelon = await this.xELONToken.deploy(this.chef.address);
        await this.xelon.deployed();

        await this.chef.setXelon(this.xelon.address);

        // set chef as xelon minter
        await this.xelon.grantRole(MINTER_ROLE, this.chef.address);

        // verify addresses
        const xelon = await this.chef.xelon();
        const owner = await this.xelon.hasRole(DEFAULT_ADMIN_ROLE, this.owner.address);

        expect(xelon).to.equal(this.xelon.address);
        expect(owner).to.be.true;
    });

    context("With ERC/LP token added to the field", function() {
        beforeEach(async function() {
            // deploy mock token to live ELON token address, use as lp
            await deployTo("ERC20Mock", this.elonTokenAddress, "LPToken", "LP", "10000000000")
            this.lp = await ethers.getContractAt("ERC20Mock", this.elonTokenAddress)

            // set balances
            await this.lp.setBalance(this.owner.address, "1000");
            await this.lp.setBalance(this.alice.address, "1000");
            await this.lp.setBalance(this.bob.address, "1000");
            await this.lp.setBalance(this.carol.address, "1000");
        });

        it("should allow emergency withdraw", async function() {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "1");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);
            
            // create lp pool
            await this.chef.add("100", this.lp.address, true);

            // bob approves 1000 lp for chef
            await this.lp.connect(this.bob).approve(this.chef.address, "1000");

            // bob deposits 100 in pool 0 (lp)
            await this.chef.connect(this.bob).deposit(0, "100");

            // verify bob has 900 lp left
            expect(await this.lp.balanceOf(this.bob.address)).to.equal("900");

            // bob emerency withdraws all lp
            await this.chef.connect(this.bob).emergencyWithdraw(0);

            // bob lp balance should be 1000
            expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
        });

        it("should give out xELONs only after farming time", async function() {
            // 100 per block farming rate starting at block 88 with bonus until block 1000
            // await time.advanceBlockTo("88");
            this.chef = await this.xELONChef.deploy("100", "88");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);
            
            // set chef as xelon minter
            await this.xelon.grantRole(MINTER_ROLE, this.chef.address);

            // create lp pool
            await this.chef.add("100", this.lp.address, true);

            // bob approves chef for 1000 lp, deposits 100 lp, block advanced to 89
            await this.lp.connect(this.bob).approve(this.chef.address, "1000");

            // depositing before block 100 fails
            let error = { message: '' }
            try {
                await this.chef.connect(this.bob).deposit(0, "1000")
            } catch (e) {
                error = e
            }
            expect(error.message.indexOf('Cannot deposit before startBlock') !== -1).to.be.true

            // proceed to block 100, expect no xelon yet
            await time.advanceBlockTo("100");
            expect(await this.xelon.totalSupply()).to.equal("0");

            // bob deposits 0, gets pending earnings of 0
            await this.chef.connect(this.bob).deposit(0, "0"); // block 101
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("0");

            // bob deposits 0, gets pending earnings of 0
            await this.chef.connect(this.bob).deposit(0, "1000"); // block 102
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("0");

            // bob deposits 0, gets pending earnings of 0
            await time.advanceBlockTo("104");
            await this.chef.connect(this.bob).deposit(0, "0"); // block 105

            // verify earnings
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("300");
            expect(await this.xelon.totalSupply()).to.equal("300");
        });

        it("should not distribute xELONs if no one deposits", async function() {
            // 100 per block farming rate starting at block 200 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "200");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);

            // set chef as xelon minter
            await this.xelon.grantRole(MINTER_ROLE, this.chef.address);
            // create lp pool
            await this.chef.add("100", this.lp.address, true);
            // bob approve chef with 1000 lp
            await this.lp.connect(this.bob).approve(this.chef.address, "1000");
            await time.advanceBlockTo("199");
            expect(await this.xelon.totalSupply()).to.equal("0");
            await time.advanceBlockTo("204");
            expect(await this.xelon.totalSupply()).to.equal("0");
            await time.advanceBlockTo("209");
            // bob deposit 10 into chef lp pool, verify balances
            await this.chef.connect(this.bob).deposit(0, "10"); // block 210
            expect(await this.xelon.totalSupply()).to.equal("0");
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("0");
            expect(await this.lp.balanceOf(this.bob.address)).to.equal("990");
            await time.advanceBlockTo("219");
            // bob withdraws 10 lp from chef lp pool
            await this.chef.connect(this.bob).withdraw(0, "10"); // block 220
            // verify balances
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("1000");
            expect(await this.xelon.totalSupply()).to.equal("1000");
            expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
        });

        it("should distribute xELONs properly for each staker", async function() {
            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "300");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);

            // set chef as xelon minter
            await this.xelon.grantRole(MINTER_ROLE, this.chef.address);
            // create lp pool
            await this.chef.add("100", this.lp.address, true);
            await this.lp.connect(this.alice).approve(this.chef.address, "1000");
            await this.lp.connect(this.bob).approve(this.chef.address, "1000");
            await this.lp.connect(this.carol).approve(this.chef.address, "1000");
            // Alice deposits 10 LPs at block 310
            await time.advanceBlockTo("309");
            await this.chef.connect(this.alice).deposit(0, "10");
            // Bob deposits 20 LPs at block 314
            await time.advanceBlockTo("313");
            await this.chef.connect(this.bob).deposit(0, "20");
            // Carol deposits 30 LPs at block 318
            await time.advanceBlockTo("317");
            await this.chef.connect(this.carol).deposit(0, "30");
            // Alice deposits 10 more LPs at block 320. At this point:
            //   Alice should have: 4*1000 + 4*1/3*1000 + 2*1/6*1000 = 5666
            //   xELONChef should have the remaining: 10000 - 5666 = 4334
            await time.advanceBlockTo("319");
            await this.chef.connect(this.alice).deposit(0, "10");
            expect(await this.xelon.balanceOf(this.alice.address)).to.equal("566");
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("0");
            expect(await this.xelon.balanceOf(this.carol.address)).to.equal("0");
            expect(await this.xelon.balanceOf(this.chef.address)).to.equal("434");
            expect(await this.xelon.totalSupply()).to.equal("1000");
            // Bob withdraws 5 LPs at block 330. At this point:
            //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
            await time.advanceBlockTo("329");
            await this.chef.connect(this.bob).withdraw(0, "5");
            expect(await this.xelon.balanceOf(this.alice.address)).to.equal("566");
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("619");
            expect(await this.xelon.balanceOf(this.carol.address)).to.equal("0");
            expect(await this.xelon.balanceOf(this.chef.address)).to.equal("815");
            expect(await this.xelon.totalSupply()).to.equal("2000");
            // Alice withdraws 20 LPs at block 340.
            // Bob withdraws 15 LPs at block 350.
            // Carol withdraws 30 LPs at block 360.
            await time.advanceBlockTo("339");
            await this.chef.connect(this.alice).withdraw(0, "20");
            await time.advanceBlockTo("349");
            await this.chef.connect(this.bob).withdraw(0, "15");
            await time.advanceBlockTo("359");
            await this.chef.connect(this.carol).withdraw(0, "30");
            // Alice should have: 5666 + 10*2/7*1000 + 10*2/6.5*1000 = 11600
            expect(await this.xelon.balanceOf(this.alice.address)).to.equal("1159");
            // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("1183");
            // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26567
            expect(await this.xelon.balanceOf(this.carol.address)).to.equal("2656");
            expect(await this.xelon.totalSupply()).to.equal("5000");
            // All of them should have 1000 LPs back.
            expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
            expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
            expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
        });

        it("should give proper xELONs allocation to each pool", async function() {
            // 100 per block farming rate starting at block 400 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "400");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);

            // set chef as xelon minter
            await this.xelon.grantRole(MINTER_ROLE, this.chef.address);
            await this.lp.connect(this.alice).approve(this.chef.address, "1000");
            await this.lp.connect(this.bob).approve(this.chef.address, "5");
            // Add first LP to the pool with allocation 1
            await this.chef.add("10", this.lp.address, true);
            // Alice deposits 10 LPs at block 410
            await time.advanceBlockTo("409");
            await this.chef.connect(this.alice).deposit(0, "10");
            // Add LP2 to the pool with allocation 2 at block 420
            await time.advanceBlockTo("419");
            // triple rewards
            await this.chef.set(0, "30", true);
            // Alice should have 10*1000 pending reward
            expect(await this.chef.pendingXelon(0, this.alice.address)).to.equal("1000");
            // Bob deposits 10 LP2s at block 425
            await time.advanceBlockTo("424");
            await this.chef.connect(this.bob).deposit(0, "5");
            expect(await this.chef.pendingXelon(0, this.alice.address)).to.equal("1500");
            await time.advanceBlockTo("430");
            expect(await this.chef.pendingXelon(0, this.alice.address)).to.equal("1833");
        });

        it("should return the correct number of pools", async function() {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "100");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);
            
            // pool length should be 0
            expect(await this.chef.poolLength()).to.equal("0");

            // create lp pool
            await this.chef.add("100", this.lp.address, true);

            // pool length should be 1
            expect(await this.chef.poolLength()).to.equal("1");
        });

        it("should add/update/track the pools allocation points", async function() {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "100");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);
            
            // totalAllocPoint should be 0
            expect(await this.chef.totalAllocPoint()).to.equal("0");

            // create lp pool
            await this.chef.add("100", this.lp.address, true);

            // totalAllocPoint should be 100
            expect(await this.chef.totalAllocPoint()).to.equal("100");

            // update lp pool alloc amount
            await this.chef.set(0, "1000", true);

            // totalAllocPoint should be 1000
            expect(await this.chef.totalAllocPoint()).to.equal("1000");
        });
    });
});
