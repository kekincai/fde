UPDATE articles SET chapter_id = 'organization.coe', core_pillar = 'Organization' WHERE source_id = 'microsoft-ai-coe';
UPDATE articles SET chapter_id = 'build.legacy', core_pillar = 'Build' WHERE source_id = 'aws-move-to-ai';
UPDATE articles SET chapter_id = 'deploy.on-prem', core_pillar = 'Deploy' WHERE source_id IN ('redhat-private-ai', 'ibm-watsonx-on-prem');
