set -ex

npm run ts
cp package.json ./dist
cd dist
npm publish --access public