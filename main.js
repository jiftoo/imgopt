#!/usr/bin/env node

import sharp from "sharp";
import fs from "fs";
import path from "path";
import {exit} from "process";
import _prompt_sync from "prompt-sync";
import {Command} from "commander";
import chalk from "chalk";
const prompt_sync = _prompt_sync({sigint: true});

const abort = (msg) => {
	console.error("error: " + msg);
	exit(-1);
};
const prompt = (msg) => {
	const resp = prompt_sync(msg + " [y/N] ");
	return resp.toLowerCase() === "y";
};

const supportedExtensions = [".jpg", ".jpeg", ".webp", ".png"];

let totalDirSizeAfter = 0; // updated in loop

const program = new Command();
program.showHelpAfterError(true);
program
	.name("imgopt")
	.version("1.0.3")
	.description("optimise all images in a folder. created by jiftoo")
	.argument("path", "path to folder")
	.option("-o --output <path>", "Output directory", "./output")
	.option("--format <png|jpg|webp|preserve>", "Output format ", "preserve")
	.option("--quality <0-100>", "Output quality (default: 85)")
	.option("--max-width <number>", "Limit output width")
	.option("--dry-run", "Perform a dry run (no file system changes)", false)
	.option("--clear", "Clear the output directory")
	.option("--copy-all", "Copy all files into the output directory")
	.option("-y --yes", "Bypass [y/n] prompts");
program.action(async (dir, options) => {
	dir = path.resolve(dir);
	if (options.quality !== undefined && (isNaN(+options.quality) || options.quality < 0 || options.quality > 100)) {
		abort("--quality has to be a number in range 0-100");
	}
	if (options.quality !== undefined) {
		options.quality = +options.quality;
	}
	if (options.maxWidth !== undefined && (isNaN(+options.maxWidth) || options.maxWidth < 1)) {
		abort("--max-width has to be a number greater than 0");
	}
	if (options.maxWidth !== undefined) {
		options.maxWidth = +options.maxWidth;
	}

	if (!fs.existsSync(dir)) {
		abort(`"${dir}" does not exist.`);
	}
	if (fs.lstatSync(dir).isFile()) {
		abort(`"${dir}" is a file`);
	}
	if (!fs.readdirSync(dir).some((filename) => supportedExtensions.includes(path.parse(filename).ext.toLowerCase()))) {
		abort(`${dir} contains no images.`);
	}

	let outputDir = "none";
	if (!options.dryRun) {
		if (path.isAbsolute(options.output)) {
			outputDir = path.normalize(options.output);
		} else {
			outputDir = path.resolve(path.join(process.cwd(), path.normalize(options.output)));
		}
		if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length !== 0) {
			console.log(`${outputDir} is not empty`);
			if (options.clear) {
				fs.readdirSync(outputDir).forEach((p) => fs.unlinkSync(path.join(outputDir, p)));
				console.log("Cleared", outputDir);
			} else {
				if (!(options.y || options.yes) && !prompt("Continue?")) {
					exit(0);
				}
			}
		}
		try {
			fs.mkdirSync(outputDir, {recursive: true});
		} catch (_) {}
		console.log("Output directory:", outputDir);
		console.log();
	}

	const totalDirSizeBefore = fs
		.readdirSync(dir)
		.filter((p) => supportedExtensions.includes(path.parse(p).ext))
		.map((p) => fs.statSync(path.join(dir, p)).size)
		.reduce((acc, v) => acc + v, 0);

	const files = fs.readdirSync(dir);
	for (let i = 0; i < files.length; i++) {
		try {
			await transform(path.parse(path.join(dir, files[i])), outputDir, options);
		} catch (err) {
			console.log(chalk.redBright("copying     (error)".padEnd(53, " ")), chalk.white(files[i]), chalk.redBright(err.message));
		}
	}

	console.log(chalk.whiteBright(""));
	console.log(
		"Total size before:".padEnd(27, " "),
		chalk.yellowBright(formatSize(totalDirSizeBefore)) + "----->",
		chalk.greenBright(formatSize(totalDirSizeAfter)),
		`(${+((1 - totalDirSizeAfter / totalDirSizeBefore) * 100).toFixed(3)}% reduction)`
	);
});

const formatSize = (bytes, pad = false) => {
	let f;
	if (bytes < 1000) {
		f = bytes.toString();
		return f + " b  " + (pad ? "-".repeat(9 - f.length) : "");
	}
	const kb = bytes / 1000;
	if (kb < 1000) {
		f = kb.toFixed(2);
		return f + " Kb " + (pad ? "-".repeat(9 - f.length) : "");
	}
	f = (kb / 1000).toFixed(2);
	return f + " Mb " + (pad ? "-".repeat(9 - f.length) : "");
};

const transform = async (filePath, outputDir, options) => {
	if (!fs.existsSync(path.format(filePath))) {
		console.log(chalk.white("skipping    (missing)".padEnd(53, " ")), chalk.white(filePath.name + filePath.ext));
		return;
	}
	if (!supportedExtensions.includes(filePath.ext?.toLowerCase())) {
		if (options.copyAll && fs.statSync(path.format(filePath)).isFile()) {
			console.log(chalk.whiteBright("copying     (not supported)".padEnd(53, " ")), chalk.whiteBright(filePath.name + filePath.ext));
			if (!options.dryRun) fs.copyFileSync(path.format(filePath), path.join(outputDir, filePath.name + filePath.ext));
		} else {
			console.log(chalk.white("skipping    (not supported)".padEnd(53, " ")), chalk.white(filePath.name + filePath.ext));
		}
		return;
	}
	const outputExtension = options.format === "preserve" ? filePath.ext : "." + options.format;

	const size = fs.statSync(path.format(filePath)).size;
	// console.log("path:", path.format(filePath));
	const shr = sharp(path.format(filePath));
	const metadata = await shr.metadata();
	const notFormatChange = options.format === "preserve";
	shr.toFormat(options.format === "preserve" ? filePath.ext.replace(".", "") : options.format, {quality: options.quality ?? 85});
	const widthChange = options.maxWidth && metadata.width > options.maxWidth;
	if (widthChange) {
		shr.resize(options.maxWidth, null, {fit: "inside"});
	}

	return new Promise((res, rej) => {
		shr.toBuffer((err, buffer, info) => {
			if (err !== null) {
				console.log(`error ${err}`, filePath.name + filePath.ext);
				rej(err);
			} else {
				if (options.dryRun) {
                    totalDirSizeAfter += buffer.byteLength;
					console.log(chalk.magenta("transformed (dry run)".padEnd(27, " ")), formatSize(size, true) + ">", formatSize(info.size, false), filePath.name + filePath.ext);
				} else if (size < buffer.byteLength) {
					totalDirSizeAfter += size;
					fs.copyFileSync(path.format(filePath), path.join(outputDir, filePath.name + filePath.ext));
					console.log(
						chalk.magenta("transformed (copy)".padEnd(27, " ")),
						formatSize(size, true) + ">",
						formatSize(info.size, false).padEnd(10, " "),
						filePath.name + filePath.ext
					);
				} else {
					totalDirSizeAfter += buffer.byteLength;
					fs.writeFileSync(path.join(outputDir, filePath.name + outputExtension), buffer);
					console.log(
						chalk.green("transformed".padEnd(27, " ")),
						formatSize(size, true) + ">",
						formatSize(info.size, false).padEnd(10, " "),
						filePath.name + filePath.ext
					);
				}
				res();
			}
		});
	});
};

program.parse();
