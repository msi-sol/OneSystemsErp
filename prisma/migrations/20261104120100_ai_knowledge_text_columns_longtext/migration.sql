-- AlterTable
ALTER TABLE `AiKnowledgeSource` MODIFY `allowedRoles` LONGTEXT NULL, MODIFY `allowedProjects` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `AiKnowledgeChunk` MODIFY `chunkText` LONGTEXT NOT NULL, MODIFY `allowedRoles` LONGTEXT NULL, MODIFY `vectorEmbedding` LONGTEXT NOT NULL;

-- AlterTable
ALTER TABLE `AiRagEmbedding` MODIFY `embeddingVector` LONGTEXT NOT NULL;
