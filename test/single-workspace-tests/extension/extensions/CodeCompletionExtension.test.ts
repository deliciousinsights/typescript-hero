import * as chai from 'chai';
import { join } from 'path';
import * as sinon from 'sinon';
import { DeclarationIndex, TypescriptParser } from 'typescript-parser';
import * as vscode from 'vscode';

import { ConfigFactory } from '../../../../src/common/factories';
import { VscodeExtensionConfig } from '../../../../src/extension/config/VscodeExtensionConfig';
import { CodeCompletionExtension } from '../../../../src/extension/extensions/CodeCompletionExtension';
import { Container } from '../../../../src/extension/IoC';
import { iocSymbols } from '../../../../src/extension/IoCSymbols';
import { DeclarationIndexMapper } from '../../../../src/extension/utilities/DeclarationIndexMapper';
import { Logger } from '../../../../src/extension/utilities/winstonLogger';

const should = chai.should();

describe('CodeCompletionExtension', () => {

    const rootPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const token = new vscode.CancellationTokenSource().token;
    let document: vscode.TextDocument;
    let extension: CodeCompletionExtension;

    before(async () => {
        const file = join(
            rootPath,
            'extension/extensions/codeCompletionExtension/codeCompletionFile.ts',
        );
        document = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(document);

        const ctx = Container.get<vscode.ExtensionContext>(iocSymbols.extensionContext);
        const logger = Container.get<Logger>(iocSymbols.logger);
        const parser = Container.get<TypescriptParser>(iocSymbols.typescriptParser);
        const config = Container.get<ConfigFactory>(iocSymbols.configuration);
        const fakeMapper = new DeclarationIndexMapper(logger, ctx, parser, config);

        const index = new DeclarationIndex(parser, rootPath);
        await index.buildIndex(
            [
                join(
                    rootPath,
                    'extension/extensions/codeCompletionExtension/codeCompletionImports.ts',
                ),
                join(
                    rootPath,
                    'server/indices/MyClass.ts',
                ),
            ],
        );

        fakeMapper.getIndexForFile = sinon.spy(() => index);

        extension = new CodeCompletionExtension(ctx, logger, parser, fakeMapper, config);
    });

    it('shoud resolve to null if typing in a string', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(0, 2), token);

        should.not.exist(result);
    });

    it('shoud resolve to null if after a "." (PropertyAccess)', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(1, 9), token);

        should.not.exist(result);
    });

    it('shoud resolve to null if in a comment', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(2, 4), token);

        should.not.exist(result);
    });

    it('shoud resolve to null if writing an import', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(3, 10), token);

        should.not.exist(result);
    });

    it('shoud create a completion list', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(6, 5), token);

        should.exist(result);
        result![0].label.should.equal('MyClass');
        result![0].detail!.should.equal('/server/indices/MyClass');

        should.not.exist(result![0].sortText);
    });

    it('should use custom sort order when config.completionSortMode is bottom', async () => {
        const orig = (extension as any).config;
        const config = new VscodeExtensionConfig();
        (config as any).codeCompletionConfig = {
            completionSortMode: 'bottom',
        };

        (extension as any).config = sinon.spy(() => config);

        try {
            const result = await extension.provideCompletionItems(document, new vscode.Position(6, 5), token);
            should.exist(result![0].sortText);
            result![0].sortText!.should.equal('9999-MyClass');
        } finally {
            (extension as any).config = orig;
        }
    });

    it('shoud add an insert command text edit if import would be new', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(6, 5), token);

        should.exist(result);
        result![0].command!.command.should.equal('typescriptHero.codeCompletion.executeIntellisenseItem');
        result![0].command!.arguments![1].declaration.name.should.equal('MyClass');
    });

    it('shoud add a replace command text edit if import will be updated with new specifier', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(9, 10), token);

        should.exist(result);
        result![0].command!.command.should.equal('typescriptHero.codeCompletion.executeIntellisenseItem');
        result![0].command!.arguments![1].declaration.name.should.equal('ShouldBeImported');
    });

    it('shoud resolve to no import if import is already imported', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(11, 9), token);

        should.exist(result);
        result!.should.be.an('array').with.lengthOf(0);
    });

    it('shoud not suggeset an item from the own file', async () => {
        const result = await extension.provideCompletionItems(document, new vscode.Position(15, 5), token);

        should.exist(result);
        result!.should.be.an('array').with.lengthOf(0);
    });

});
