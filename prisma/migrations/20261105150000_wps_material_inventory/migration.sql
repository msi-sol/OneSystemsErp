CREATE TABLE `WorkPackageMaterialInventoryState` (
    `id` VARCHAR(191) NOT NULL,
    `rowVersion` INTEGER NOT NULL DEFAULT 0,
    `dataJson` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
