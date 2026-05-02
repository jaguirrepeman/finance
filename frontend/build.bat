@echo off
echo Transpiling components.jsx to components.js ...
npx.cmd esbuild components.jsx --loader:.jsx=jsx --jsx=transform --outfile=components.js
echo Done!
