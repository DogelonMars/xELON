const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("xELONToken", function () {
  before(async function () {
    this.xELONToken = await ethers.getContractFactory("xELONToken");
    [this.owner,this.alice,this.bob,this.carol] = await ethers.getSigners();
  })

  beforeEach(async function () {
    this.xelon = await this.xELONToken.deploy('0x0000000000000000000000000000000000000000');
    await this.xelon.deployed();
  })

  it("should have correct name and symbol and decimal", async function () {
    const name = await this.xelon.name();
    const symbol = await this.xelon.symbol();
    const decimals = await this.xelon.decimals();
    expect(name, "xELON");
    expect(symbol, "XELON");
    expect(decimals, "18");
  })

  it("should only allow owner or minter to mint token", async function () {
    await this.xelon.mint(this.alice.address, "100");
    await this.xelon.mint(this.bob.address, "1000");
    await expect(this.xelon.connect(this.bob).mint(this.carol.address, "1000")).to.be.revertedWith(
      "Must be minter"
    );
    let totalSupply = await this.xelon.totalSupply();
	let ownerBal = await this.xelon.balanceOf(this.owner.address);
    let aliceBal = await this.xelon.balanceOf(this.alice.address);
    let bobBal = await this.xelon.balanceOf(this.bob.address);
    let carolBal = await this.xelon.balanceOf(this.carol.address);
    expect(ownerBal).to.equal("0");
    expect(totalSupply).to.equal("1100");
    expect(aliceBal).to.equal("100");
    expect(bobBal).to.equal("1000");
    expect(carolBal).to.equal("0");
    let bobIsMinter = await this.xelon.isMinter(this.bob.address);
    expect(bobIsMinter).to.be.false;

    // try to add minter role using not owner account
    let MINTER_ROLE=ethers.utils.id("MINTER_ROLE")
    await this.xelon.grantRole(MINTER_ROLE,this.bob.address);
    bobIsMinter = await this.xelon.isMinter(this.bob.address);
    expect(bobIsMinter).to.be.true;
    
    // have bob mint 2000 for carol
    await this.xelon.connect(this.bob).mint(this.carol.address, "2000");
    carolBal = await this.xelon.balanceOf(this.carol.address);
    expect(carolBal).to.equal("2000");

    // revoke bob's minter role
    await this.xelon.revokeRole(MINTER_ROLE,this.bob.address);
    bobIsMinter = await this.xelon.isMinter(this.bob.address);
    expect(bobIsMinter).to.be.false;

    // try to grant bob's minter role using different account
    await expect(this.xelon.connect(this.carol).grantRole(MINTER_ROLE,this.bob.address)).to.be.reverted;
    await expect(this.xelon.connect(this.bob).mint(this.carol.address, "1000", { from: this.bob.address })).to.be.revertedWith(
      "Must be minter"
    );

  })

  it("should fail if users transfer", async function () {
    await this.xelon.mint(this.owner.address, "100")
    await expect(this.xelon.transfer(this.carol.address, "100")).to.be.revertedWith("xElon is non-transferable.")
  })
})
