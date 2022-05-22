#!/usr/bin/env node

import sharp from "sharp";
import fs, {copyFileSync} from "fs";
import path from "path";
import {exit} from "process";
import _prompt_sync from "prompt-sync";
import {Command} from "commander";
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

const program = new Command();
program.showHelpAfterError(true);
program
	.name("imgopt")
	.version("1.0.0")
	.argument("path", "path to folder")
	.option("--format <png|jpg|webp|preserve>", "Output format ", "preserve")
	.option("--quality <0-100>", "Output quality (default: 85)")
	.option("--max-width <number>", "Limit output width")
	.option("--dry-run", "Perform a dry run", false)
	.option("--clear", "Clear the output directory");
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

	let outputDir = path.resolve(path.join(dir, "output"));
	if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length !== 0) {
		console.log(`${outputDir} is not empty`);
		if (options.clear) {
			fs.readdirSync(outputDir).forEach((p) => fs.unlinkSync(path.join(outputDir, p)));
			console.log("Cleared", outputDir);
		} else {
			if (!prompt("Continue?")) {
				exit(0);
			}
		}
	}
	try {
		fs.mkdirSync(outputDir);
	} catch (_) {}
	console.log("Output directory:", outputDir);
	console.log();

	const totalDirSizeBefore = fs
		.readdirSync(dir)
		.filter((p) => supportedExtensions.includes(path.parse(p).ext))
		.map((p) => fs.statSync(path.join(dir, p)).size)
		.reduce((acc, v) => acc + v, 0);

	await Promise.all(fs.readdirSync(dir).map(async (p) => transform(path.parse(path.join(dir, p)), outputDir, options)));

	const totalDirSizeAfter = fs
		.readdirSync(outputDir)
		.filter((p) => supportedExtensions.includes(path.parse(p).ext))
		.map((p) => fs.statSync(path.join(outputDir, p)).size)
		.reduce((acc, v) => acc + v, 0);

	console.log(
		"Total size before:",
		formatSize(totalDirSizeBefore),
		"after:",
		formatSize(totalDirSizeAfter),
		`(${+((1 - totalDirSizeAfter / totalDirSizeBefore) * 100).toFixed(3)}% reduction)`
	);
});

const formatSize = (bytes, pad = false) => {
	let f;
	if (bytes < 1000) {
		f = bytes.toString();
		return f + " b " + (pad ? " ".repeat(10 - f.length) : "");
	}
	const kb = bytes / 1000;
	if (kb < 1000) {
		f = kb.toFixed(2);
		return f + " Kb" + (pad ? " ".repeat(10 - f.length) : "");
	}
	f = (kb / 1000).toFixed(2);
	return f + " Mb" + (pad ? " ".repeat(10 - f.length) : "");
};

const transform = async (filePath, outputDir, options) => {
	if (!supportedExtensions.includes(filePath.ext)) {
		console.log(filePath.name + filePath.ext + ": skipping (not supported)");
		return;
	}
	const outputExtension = options.format === "preserve" ? filePath.ext : "." + options.format;

	const size = fs.statSync(path.format(filePath)).size;
	const shr = sharp(path.format(filePath));
	const metadata = await shr.metadata();
	const noQualityAndFormatChange = options.quality === undefined && options.format === "preserve";
	if (!noQualityAndFormatChange) {
		shr.toFormat(options.format === "preserve" ? filePath.ext.replace(".", "") : options.format, {quality: options.quality ?? 85});
	}
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
				if (size < buffer.byteLength || (!widthChange && noQualityAndFormatChange)) {
					fs.copyFileSync(path.format(filePath), path.join(outputDir, filePath.name + filePath.ext));
					console.log("transformed (copy)", formatSize(size, true), "->", formatSize(info.size, true), filePath.name + filePath.ext);
				} else {
					fs.writeFileSync(path.join(outputDir, filePath.name + outputExtension), buffer);
					console.log("transformed       ", formatSize(size, true), "->", formatSize(info.size, true), filePath.name + filePath.ext);
				}
				res();
			}
		});
	});
};

program.parse();
