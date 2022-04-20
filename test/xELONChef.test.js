const { ethers } = require("hardhat");
const { expect } = require("chai");
const { time } = require("./utilities");

describe("xELONChef", function() {
    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const MINTER_ROLE = ethers.utils.id("MINTER_ROLE");

    before(async function() {
        [this.owner, this.alice, this.bob, this.carol, _, this.minter] = await ethers.getSigners();

        this.xELONChef = await ethers.getContractFactory("xELONChef");
        this.xELONToken = await ethers.getContractFactory("xELONToken");
        this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
    });

    it("should set correct state variables", async function() {
        // deploy chef
        this.chef = await this.xELONChef.deploy("1000", "0", "1000");
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
            // create mock LP token
            this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000");
            
            // distribute lp tokens
            await this.lp.transfer(this.owner.address, "1000");
            await this.lp.transfer(this.alice.address, "1000");
            await this.lp.transfer(this.bob.address, "1000");
            await this.lp.transfer(this.carol.address, "1000");
    
            // create 2nd mock LP token
            this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000");
            
            // distribute lp2 tokens
            await this.lp.transfer(this.owner.address, "1000");
            await this.lp2.transfer(this.alice.address, "1000");
            await this.lp2.transfer(this.bob.address, "1000");
            await this.lp2.transfer(this.carol.address, "1000");
        });

        it("should allow emergency withdraw", async function() {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "100", "1000");
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
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "100", "1000");
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
            await this.chef.connect(this.bob).deposit(0, "100");
            await time.advanceBlockTo("89");

            // bob deposits 0, gets pending earningsof 0
            await this.chef.connect(this.bob).deposit(0, "0"); // block 90
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("0");
            await time.advanceBlockTo("94");

            // bob deposits 0, gets pending earningsof 0
            await this.chef.connect(this.bob).deposit(0, "0"); // block 95
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("0");
            await time.advanceBlockTo("99");

            // bob deposits 0, gets pending earnings of 0
            await this.chef.connect(this.bob).deposit(0, "0"); // block 100
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("0");
            await time.advanceBlockTo("100");

            // bob deposits 0, gets pending earnings of 1000
            await this.chef.connect(this.bob).deposit(0, "0"); // block 101
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("1000");

            // bob deposits 0, gets pending earnings of 0
            await time.advanceBlockTo("104");
            await this.chef.connect(this.bob).deposit(0, "0"); // block 105

            // verify earnings
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("5000");
            expect(await this.xelon.totalSupply()).to.equal("5000");
        });

        it("should not distribute xELONs if no one deposits", async function() {
            // 100 per block farming rate starting at block 200 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "200", "1000");
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
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("10000");
            expect(await this.xelon.totalSupply()).to.equal("10000");
            expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
        });

        it("should distribute xELONs properly for each staker", async function() {
            // 100 per block farming rate starting at block 300 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "300", "1000");
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
            expect(await this.xelon.balanceOf(this.alice.address)).to.equal("5666");
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("0");
            expect(await this.xelon.balanceOf(this.carol.address)).to.equal("0");
            expect(await this.xelon.balanceOf(this.chef.address)).to.equal("4334");
            expect(await this.xelon.totalSupply()).to.equal("10000");
            // Bob withdraws 5 LPs at block 330. At this point:
            //   Bob should have: 4*2/3*1000 + 2*2/6*1000 + 10*2/7*1000 = 6190
            await time.advanceBlockTo("329");
            await this.chef.connect(this.bob).withdraw(0, "5");
            expect(await this.xelon.balanceOf(this.alice.address)).to.equal("5666");
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("6190");
            expect(await this.xelon.balanceOf(this.carol.address)).to.equal("0");
            expect(await this.xelon.balanceOf(this.chef.address)).to.equal("8144");
            expect(await this.xelon.totalSupply()).to.equal("20000");
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
            expect(await this.xelon.balanceOf(this.alice.address)).to.equal("11600");
            // Bob should have: 6190 + 10*1.5/6.5 * 1000 + 10*1.5/4.5*1000 = 11831
            expect(await this.xelon.balanceOf(this.bob.address)).to.equal("11831");
            // Carol should have: 2*3/6*1000 + 10*3/7*1000 + 10*3/6.5*1000 + 10*3/4.5*1000 + 10*1000 = 26568
            expect(await this.xelon.balanceOf(this.carol.address)).to.equal("26568");
            expect(await this.xelon.totalSupply()).to.equal("50000");
            // All of them should have 1000 LPs back.
            expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
            expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
            expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
        });

        it("should give proper xELONs allocation to each pool", async function() {
            // 100 per block farming rate starting at block 400 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "400", "1000");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);

            // set chef as xelon minter
            await this.xelon.grantRole(MINTER_ROLE, this.chef.address);
            await this.lp.connect(this.alice).approve(this.chef.address, "1000");
            await this.lp2.connect(this.bob).approve(this.chef.address, "1000");
            // Add first LP to the pool with allocation 1
            await this.chef.add("10", this.lp.address, true);
            // Alice deposits 10 LPs at block 410
            await time.advanceBlockTo("409");
            await this.chef.connect(this.alice).deposit(0, "10");
            // Add LP2 to the pool with allocation 2 at block 420
            await time.advanceBlockTo("419");
            await this.chef.add("20", this.lp2.address, true);
            // Alice should have 10*1000 pending reward
            expect(await this.chef.pendingXelon(0, this.alice.address)).to.equal("10000");
            // Bob deposits 10 LP2s at block 425
            await time.advanceBlockTo("424");
            await this.chef.connect(this.bob).deposit(1, "5");
            // Alice should have 10000 + 5*1/3*1000 = 11666 pending reward
            expect(await this.chef.pendingXelon(0, this.alice.address)).to.equal("11666");
            await time.advanceBlockTo("430");
            // At block 430. Bob should get 5*2/3*1000 = 3333. Alice should get ~1666 more.
            expect(await this.chef.pendingXelon(0, this.alice.address)).to.equal("13333");
            expect(await this.chef.pendingXelon(1, this.bob.address)).to.equal("3333");
        });

        it("should stop giving bonus xELONs after the bonus period ends", async function() {
            // 100 per block farming rate starting at block 500 with bonus until block 600
            this.chef = await this.xELONChef.deploy("100", "500", "600");
            await this.chef.deployed();

            this.xelon = await this.xELONToken.deploy(this.chef.address);
            await this.xelon.deployed();

            await this.chef.setXelon(this.xelon.address);

            // set chef as xelon minter
            await this.xelon.grantRole(MINTER_ROLE, this.chef.address);
            await this.lp.connect(this.alice).approve(this.chef.address, "1000");
            await this.chef.add("1", this.lp.address, true);
            // Alice deposits 10 LPs at block 590
            await time.advanceBlockTo("589");
            await this.chef.connect(this.alice).deposit(0, "10");
            // At block 605, she should have 1000*10 + 100*5 = 10500 pending.
            await time.advanceBlockTo("605");
            expect(await this.chef.pendingXelon(0, this.alice.address)).to.equal("10500");
            // At block 606, Alice withdraws all pending rewards and should get 10600.
            await this.chef.connect(this.alice).deposit(0, "0");
            expect(await this.chef.pendingXelon(0, this.alice.address)).to.equal("0");
            expect(await this.xelon.balanceOf(this.alice.address)).to.equal("10600");
        });

        it("should return the correct number of pools", async function() {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "100", "1000");
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

            // create lp2 pool
            await this.chef.add("100", this.lp2.address, true);

            // pool length should be 2
            expect(await this.chef.poolLength()).to.equal("2");

        });

        it("should add/update/track the pools allocation points", async function() {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            this.chef = await this.xELONChef.deploy("100", "100", "1000");
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

            // create lp2 pool
            await this.chef.add("100", this.lp2.address, true);

            // totalAllocPoint should be 200
            expect(await this.chef.totalAllocPoint()).to.equal("200");

            // update lp pool alloc amount
            await this.chef.set(0, "1000", true);

            // totalAllocPoint should be 1100
            expect(await this.chef.totalAllocPoint()).to.equal("1100");

            // update lp2 pool alloc amount
            await this.chef.set(1, "2000", true);

            // totalAllocPoint should be 3000
            expect(await this.chef.totalAllocPoint()).to.equal("3000");

            // check pool 0
            expect((await this.chef.poolInfo(0)).allocPoint).to.equal("1000");

            // check pool 1
            expect((await this.chef.poolInfo(1)).allocPoint).to.equal("2000");
        });

    });
});
