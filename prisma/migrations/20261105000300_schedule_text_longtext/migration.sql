-- AlterTable
ALTER TABLE `ScheduleActivity` MODIFY `aiRationale` LONGTEXT NULL;

-- AlterTable
ALTER TABLE `ScheduleDelayRecord` MODIFY `cause` LONGTEXT NOT NULL;
