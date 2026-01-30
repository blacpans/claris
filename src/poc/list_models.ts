import '../../src/config/env.js';
import { GoogleGenAI } from '@google/genai';

const client = new GoogleGenAI({
	project: process.env.GOOGLE_CLOUD_PROJECT,
	location: 'us-central1',
	vertexai: true,
});

async function listModels() {
	console.log('🔍 Listing all models in us-central1 with full info...');
	try {
		const pager = await client.models.list();
		for await (const model of pager) {
			if (model.name?.includes('gemini')) {
				console.log(`- ${model.name}`);
				console.log('  SupportedActions:', model.supportedActions);
			}
		}
	} catch (error) {
		console.error('💥 Failed to list models:', error);
	}
}

listModels();
