import { App, Plugin, TFile, TFolder, PluginSettingTab, Setting, Notice } from "obsidian";
import moment from "moment";

interface AutomaticFoldersSettings {
	baseJournalFolder: string;
	createYearFolders: boolean;
	createMonthFolders: boolean;

	dailyNoteFormat: string;
	monthlyFolderFormat: string;
	yearlyFolderFormat: string;
}

const DEFAULT_SETTINGS: AutomaticFoldersSettings = {
	baseJournalFolder: "1 - journal",
	createYearFolders: true,
	createMonthFolders: true,

	dailyNoteFormat: "YYYY-MM-DD",
	monthlyFolderFormat: "MM-YYYY",
	yearlyFolderFormat: "YYYY",
};

export default class AutomaticFoldersPlugin extends Plugin {
	settings: AutomaticFoldersSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new AutomaticFoldersSettingTab(this.app, this));

		console.log("Auto File Organizer loaded");

		await this.ensureCurrentFolderExists();

		await this.organizeExistingFiles();

		this.registerEvent(
			this.app.vault.on("create", async (file: TFile) => {
				if (file.path.startsWith(`${this.settings.baseJournalFolder}/`)) {
					await this.handleOldDailyFile(file);
				}
			})
		);
	}

	async ensureCurrentFolderExists() {
		//generate year/month path for folderpath
		const yearString = moment().format(this.settings.yearlyFolderFormat);
		const monthString = moment().format(this.settings.monthlyFolderFormat);

		const yearlyFolderPath = `${this.settings.baseJournalFolder}/${yearString}`;
		const monthlyFolderPath = `${this.settings.baseJournalFolder}/${yearString}/${monthString}`;

		// check if yearly folder exists already, if not create
		await this.ensureFolderExists(yearlyFolderPath);
		// check if monthly folder exists already, if not create
		await this.ensureFolderExists(monthlyFolderPath);
	}

	async ensureFolderExists(folderPath: string) {

		if (!(await this.app.vault.adapter.exists(folderPath))) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	async organizeExistingFiles() {
		const baseFolder = this.settings.baseJournalFolder;
		const journalFolder = this.app.vault.getAbstractFileByPath(baseFolder);
		
		if (!(journalFolder instanceof TFolder)) {
			console.error(`Folder "${baseFolder}" not found.`);
			return;
		}

		for (const file of journalFolder.children) {
			if (file instanceof TFile) {
				await this.handleOldDailyFile(file);
			}
		}
	}

	async handleOldDailyFile(file: TFile): Promise<string | null> {

		const baseFolder = this.settings.baseJournalFolder;
		const fileBaseName = file.name.replace(/\.[^/.]+$/, "");

		// check files date
		const getFilesDate = moment(
			fileBaseName,
			this.settings.dailyNoteFormat,
			true
		);
		if (!getFilesDate.isValid()) {
			console.log(
				`Could not parse a valid date from file name: ${file.name}`
			);
			return null;
		}

		// check if file is today's file
		const todayString = moment().format(this.settings.dailyNoteFormat);
		if (fileBaseName == todayString) {
			console.log(`Skipping today's file: ${file.name}`);
			return null;
		}

		const fileYearString = getFilesDate.format(
			this.settings.yearlyFolderFormat
		);
		const fileMonthString = getFilesDate.format(
			this.settings.monthlyFolderFormat
		); 

		// where should it go
		const targetFolderPath = `${baseFolder}/${fileYearString}/${fileMonthString}`;

		await this.ensureFolderExists(targetFolderPath);

		// skip if file is in correct place already
		if (file.path.startsWith(targetFolderPath)) {
			console.log(`Skipping "${file.name}" (already in correct folder)`);
			return null;
		}

		await this.ensureFolderExists(targetFolderPath);

		// move file
		const newPath = `${targetFolderPath}/${file.name}`;
		try {
			await this.app.vault.rename(file, newPath);
			console.log(`Moved "${file.name}" to folder: ${targetFolderPath}`);
			return file.name;
		} catch (error) {
			console.error(`Error moving file "${file.name}":`, error);
			return null;
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class AutomaticFoldersSettingTab extends PluginSettingTab {
	plugin: AutomaticFoldersPlugin;

	constructor(app: App, plugin: AutomaticFoldersPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		// === General Settings ===
		containerEl.createEl("h3", { text: "Automatic Folders Settings" });

		// Base Journal Folder
		new Setting(containerEl)
			.setName("Base Journal Folder")
			.setDesc("The folder where yearly and monthly folders will be created.")
			.addText(text => 
				text
					.setPlaceholder("Enter folder name (e.g., 1 - journal)")
					.setValue(this.plugin.settings.baseJournalFolder)
					.onChange(async (value) => {
						this.plugin.settings.baseJournalFolder = value.trim();
						await this.plugin.saveSettings();
						new Notice(`Base journal folder set to: ${value}`);
					})
			);

		// Create Yearly Folders Toggle
		new Setting(containerEl)
			.setName("Create Yearly Folders")
			.setDesc("Automatically create folders for each year (e.g., '2025').")
			.addToggle(toggle => 
				toggle
					.setValue(this.plugin.settings.createYearFolders)
					.onChange(async (value) => {
						this.plugin.settings.createYearFolders = value;
						await this.plugin.saveSettings();
						new Notice(`Yearly folder creation: ${value ? "Enabled" : "Disabled"}`);
					})
			);

		// Create Monthly Folders Toggle
		new Setting(containerEl)
			.setName("Create Monthly Folders")
			.setDesc("Automatically create folders for each month (e.g., '02-25').")
			.addToggle(toggle => 
				toggle
					.setValue(this.plugin.settings.createMonthFolders)
					.onChange(async (value) => {
						this.plugin.settings.createMonthFolders = value;
						await this.plugin.saveSettings();
						new Notice(`Monthly folder creation: ${value ? "Enabled" : "Disabled"}`);
					})
			);

		// Daily Note Format
		new Setting(containerEl)
			.setName("Daily Note Format")
			.setDesc("Format for daily note file names (e.g., 'YYYY-MM-DD').")
			.addText(text => 
				text
					.setPlaceholder("Enter format (e.g., YYYY-MM-DD)")
					.setValue(this.plugin.settings.dailyNoteFormat)
					.onChange(async (value) => {
						this.plugin.settings.dailyNoteFormat = value.trim();
						await this.plugin.saveSettings();
						new Notice(`Daily note format set to: ${value}`);
					})
			);

		// Monthly Folder Format
		new Setting(containerEl)
			.setName("Monthly Folder Format")
			.setDesc("Format for monthly folders (e.g., 'MM-DD').")
			.addText(text => 
				text
					.setPlaceholder("Enter format (e.g., MM-YYYY)")
					.setValue(this.plugin.settings.monthlyFolderFormat)
					.onChange(async (value) => {
						this.plugin.settings.monthlyFolderFormat = value.trim();
						await this.plugin.saveSettings();
						new Notice(`Monthly folder format set to: ${value}`);
					})
			);

		// Yearly Folder Format
		new Setting(containerEl)
			.setName("Yearly Folder Format")
			.setDesc("Format for yearly folders (e.g., 'YYYY').")
			.addText(text => 
				text
					.setPlaceholder("Enter format (e.g., YYYY)")
					.setValue(this.plugin.settings.yearlyFolderFormat)
					.onChange(async (value) => {
						this.plugin.settings.yearlyFolderFormat = value.trim();
						await this.plugin.saveSettings();
						new Notice(`Yearly folder format set to: ${value}`);
					})
			);
	}
}
