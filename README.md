[![GitHub Repo stars](https://img.shields.io/github/stars/jiftoo/imgopt?style=social)](https://github.com/jiftoo/imgopt)

# Welcome to `imgopt`!
This cli tool is inspired by the awesome [expo-optimize](https://www.npmjs.com/package/expo-optimize) tool. Unlike the former, imgopt allows the user to convert images to other formats, or limit their width outside of an npm project and without the need to install the `sharp-cli` package.
# Usage :rocket:
```
# Simply run this
npx imgopt <input-directory> [options]
```
See `npx imgopt --help` for more.
# Examples :pencil:
```
# Convert all files in the current directory to JPEG with quality=80, save to ./optimized
npx imgopt . --format jpg --quality 80 -o optimized

#Convert all files to PNG, limit width to 1000px, also copy non-image files, save to ./output (default)
npx imgopt . --format png --max-width 1000 --copy-all

# Keep format, quality=90, clear the output folder before optimizing
npx imgopt . --quality 90 --clear
```
