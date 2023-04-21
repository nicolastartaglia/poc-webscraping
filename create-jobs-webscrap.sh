input="env"
while IFS= read -r line
do
  COUNT=`echo "$line" | awk -F"," '{print $1}'`;
  URL=`echo "$line" | awk -F"," '{print $2}'`;
  SEARCH=`echo "$line" | awk -F"," '{print $3}'`;
  cat template-job-webscrap.yaml | sed -e "s/\$COUNT/$COUNT/g" | sed -e "s/\$URL/$URL/g" | sed -e "s/\$SEARCH/$SEARCH/g" > ./jobs-webscrap/job-$COUNT.yaml;
done < "$input"