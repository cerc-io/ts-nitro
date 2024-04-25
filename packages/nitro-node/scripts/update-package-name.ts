import PackageJson from '@npmcli/package-json';

async function main() {
  const pkgJson = await PackageJson.load('.');
  const { content } = pkgJson;

  content.name = '@cerc-nitro/nitro-node-browser';
  pkgJson.update(content);

  await pkgJson.save();
}

main();
