DROP INDEX `todo_occurrences_todo_id_date_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `todo_occurrences_todo_id_date_idx` ON `todo_occurrences` (`todo_id`,`occurrence_date`);