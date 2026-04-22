output "table_name" {
  value = aws_dynamodb_table.tasks.name
}

output "table_arn" {
  value = aws_dynamodb_table.tasks.arn
}

output "stream_arn" {
  value = aws_dynamodb_table.tasks.stream_arn
}