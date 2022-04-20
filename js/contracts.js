function isMainnet() {
  return (hre.network.name == 'mainnet' || hre.network.name == 'matic');
}
async function main() {
  this.xELONToken = await ethers.getContractFactory("xELONToken");
  [this.owner, this.alice, this.bob, this.carol, this.dev, this.minter] = await ethers.getSigners();
  this.xelon = await this.xELONToken.deploy();
  await this.xelon.deployed();
  console.log('deployed xELON token');

  this.xELONChef = await ethers.getContractFactory("xELONChef");
  this.chef = await this.xELONChef.deploy(this.xelon.address, this.dev.address, "1000", "0", "1000");
  await this.chef.deployed();
  let MINTER_ROLE=ethers.utils.id("MINTER_ROLE");
  await this.xelon.grantRole(MINTER_ROLE, this.chef.address);
  console.log('deployed xELON chef');

  if (isMainnet()) {
    let sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds*1000));
    await sleep(60);
    hre.run("verify:verify", { address: this.xelon.address, constructorArguments: [] })
    await sleep(60);
    hre.run("verify:verify", { address: this.chef.address, constructorArguments: [this.xelon.address, this.dev.address, "1000", "0", "1000"] })
  }
}
main();
