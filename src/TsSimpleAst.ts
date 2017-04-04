﻿import * as ts from "typescript";
import * as errors from "./errors";
import * as compiler from "./compiler";
import * as factories from "./factories";
import {CompilerOptionsResolver, FileUtils} from "./utils";
import {FileSystemHost} from "./FileSystemHost";
import {DefaultFileSystemHost} from "./DefaultFileSystemHost";

export interface Options {
    tsConfigFilePath?: string;
    compilerOptions?: ts.CompilerOptions;
}

/**
 * Compiler wrapper.
 */
export class TsSimpleAst {
    private readonly compilerOptions: ts.CompilerOptions;
    private readonly languageService: compiler.LanguageService;
    /** @internal */
    private readonly compilerFactory: factories.CompilerFactory;

    /**
     * Initializes a new instance.
     * @param options - Optional options.
     * @param fileSystem - Optional file system host. Useful for mocking access to the file system.
     */
    constructor(options: Options = {}, private fileSystem: FileSystemHost = new DefaultFileSystemHost()) {
        if (options.tsConfigFilePath != null && options.compilerOptions != null)
            throw new errors.InvalidOperationError(`Cannot set both ${nameof(options.tsConfigFilePath)} and ${nameof(options.compilerOptions)}.`);

        const compilerOptionsResolver = new CompilerOptionsResolver(fileSystem);
        this.compilerOptions = compilerOptionsResolver.getCompilerOptions(options);

        this.languageService = new compiler.LanguageService(fileSystem, this.compilerOptions);
        this.compilerFactory = new factories.CompilerFactory(fileSystem, this.languageService);
    }

    /**
     * Add source files based on file globs.
     * @param fileGlobs - File globs to add files based on.
     */
    addSourceFiles(fileGlobs: string[]) {
        const filePaths = this.fileSystem.glob(fileGlobs).map(path => this.fileSystem.normalize(this.fileSystem.getAbsolutePath(path)));

        for (let filePath of filePaths) {
            // ignore any FileNotFoundErrors
            try {
                this.getOrAddSourceFileFromFilePath(filePath);
            } catch (ex) {
                /* istanbul ignore if */
                if (!(ex instanceof errors.FileNotFoundError))
                    throw ex;
            }
        }
    }

    /**
     * Gets or adds a source file from a file path.
     * @param filePath - File path to create the file from.
     */
    getOrAddSourceFileFromFilePath(filePath: string): compiler.SourceFile {
        if (!this.fileSystem.fileExists(filePath))
            throw new errors.FileNotFoundError(filePath);
        return this.compilerFactory.getSourceFileFromFilePath(filePath);
    }

    /**
     * Adds a source file from text.
     * @param filePath - File path for the source file.
     * @param sourceFileText - Source file text.
     * @throws - InvalidOperationError if a source file already exists at the provided file path.
     */
    addSourceFileFromText(filePath: string, sourceFileText: string): compiler.SourceFile {
        return this.compilerFactory.addSourceFileFromText(filePath, sourceFileText);
    }

    /**
     * Gets a source file by a file name, file path, or search function. Returns undefined if none exists.
     * @param fileName - File name or path that the path could end with or equal.
     * @param searchFunction - Search function.
     */
    getSourceFile(fileNameOrPath: string): compiler.SourceFile | undefined;
    getSourceFile(searchFunction: (file: compiler.SourceFile) => boolean): compiler.SourceFile | undefined;
    getSourceFile(fileNameOrSearchFunction: string | ((file: compiler.SourceFile) => boolean)): compiler.SourceFile | undefined {
        let searchFunction = fileNameOrSearchFunction as ((file: compiler.SourceFile) => boolean);

        if (typeof fileNameOrSearchFunction === "string")
            searchFunction = (def) => FileUtils.filePathMatches(def.getFilePath(), fileNameOrSearchFunction);

        return this.getSourceFiles().find(searchFunction);
    }

    /**
     * Gets all the source files contained in the compiler wrapper.
     */
    getSourceFiles(): compiler.SourceFile[] {
        return this.languageService.getSourceFiles();
    }
}
