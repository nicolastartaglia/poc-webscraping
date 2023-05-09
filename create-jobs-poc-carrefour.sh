input="env-poc-carrefour"
while IFS= read -r line
do
  COUNT=`echo "$line" | awk -F"," '{print $1}'`;
  URL=`echo "$line" | awk -F"," '{print $2}'`;
  DISTRIBUTEUR=`echo "$line" | awk -F"," '{print $3}'`;
  SEARCH=`echo "$line" | awk -F"," '{print $4}'`;
  cat templates-job/template-job-poc-carrefour.yaml | sed -e "s/\$COUNT/$COUNT/g" | sed -e "s/\$JOB/\"$COUNT\"/g" | sed -e "s/\$URL/$URL/g" | sed -e "s/\$DISTRIBUTEUR/$DISTRIBUTEUR/g" | sed -e "s/\$SEARCH/$SEARCH/g" > ./jobs-poc-carrefour/job-$COUNT.yaml;
  echo $SEARCH >> liste-barre-code
done < "$input"