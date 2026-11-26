// Prompt-evaluation set for Writing scoring (M6-B5): 20 answers with a target band.
//
// IMPORTANT, about the "known" bands: these answers were written for this set to sit at the band
// given, following the public band descriptors (errors, range, development and organisation typical
// of that band). They are NOT examiner-marked, so the target is an informed label, not ground truth,
// and the eval measures agreement with it. For a stronger check, add examiner-marked scripts (for
// example published sample scripts with examiner bands) to the gitignored file
// _eval/writing_essays.local.json (same fields); they're copyrighted, so they stay out of the repo.
//
// Task 1 Academic visuals are given as tables in the task text (a table is a valid Task 1 visual),
// so the eval needs no images.

export type EvalEssay = {
  id: string;
  kind: "t1_academic" | "t1_general" | "t2";
  prompt: string;
  essay: string;
  expected_band: number;
};

const T2_REMOTE = "Some people believe that working from home benefits both employees and employers. Others think it causes more problems than it solves. Discuss both views and give your own opinion.";
const T2_TECH_CHILDREN = "Children today spend a lot of time on phones and computers. Is this a positive or negative development?";
const T2_UNIVERSITY = "Some people think that university education should be free for everyone. To what extent do you agree or disagree?";
const T2_CITIES = "In many countries, more and more people are moving from the countryside to cities. What are the causes of this, and what problems does it create?";
const T2_TOURISM = "International tourism has brought enormous benefits to many places, but it has also caused problems. Do the advantages outweigh the disadvantages?";
const T2_ENVIRONMENT = "Some people say that individuals can do very little to improve the environment and that only governments and large companies can make a difference. To what extent do you agree or disagree?";

const T1G_NEIGHBOUR = `You recently moved into a new flat. Your neighbour often plays loud music late at night.
Write a letter to your neighbour. In your letter:
- introduce yourself
- explain the problem
- suggest a solution.
Begin your letter: Dear …`;
const T1G_COURSE = `You have just completed a short evening course at a local college.
Write a letter to the course organiser. In your letter:
- say which course you took and why
- explain what you liked about it
- suggest how the course could be improved.
Begin your letter: Dear Sir or Madam,`;
const T1G_FRIEND = `A friend is coming to visit your city for the first time next month.
Write a letter to your friend. In your letter:
- suggest the best time to visit
- recommend places to see
- offer to help with accommodation.
Begin your letter: Dear …`;

const T1A_ENERGY = `The table below shows the percentage of electricity produced from different sources in one country in 2000 and 2020.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

| Source | 2000 | 2020 |
|---|---|---|
| Coal | 55% | 25% |
| Natural gas | 20% | 30% |
| Nuclear | 15% | 10% |
| Wind and solar | 2% | 28% |
| Hydro | 8% | 7% |`;
const T1A_SPENDING = `The table below shows average weekly household spending (in US dollars) on four categories in three countries in 2023.
Summarise the information by selecting and reporting the main features, and make comparisons where relevant.

| Category | Country A | Country B | Country C |
|---|---|---|---|
| Housing | 320 | 210 | 150 |
| Food | 140 | 160 | 120 |
| Transport | 90 | 60 | 85 |
| Leisure | 110 | 45 | 40 |`;

export const ESSAYS: EvalEssay[] = [
  // ── Task 2 ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "t2-01",
    kind: "t2",
    prompt: T2_TECH_CHILDREN,
    expected_band: 4,
    essay: `Now a days childrens use phone and computer very much time. I think it is negative thing.

First, childrens not go outside and play with friend. They sit at home all day with phone and they are become fat and not healthy. Also they eyes is bad because the screen. My brother is play game every day 6 hour and he dont want do homework.

Second, in the internet have many bad things. Childrens can see things that is not good for them and parents dont know what they are see. This is very danger.

But some peoples say computer is good for study. It is true, they can find informations for school. But most of childrens only play game and watch video, not study.

In conclusion, I think phone and computer is negative for childrens. Parents must to stop them and give them only one hour in a day. Then childrens will be more healthy and good in school.`,
  },
  {
    id: "t2-02",
    kind: "t2",
    prompt: T2_UNIVERSITY,
    expected_band: 5,
    essay: `Education is very important for every person and for the country. Some people think university should be free for everyone. I agree with this idea in some way but not completely.

On the one hand, if university is free, more students can study. Many families are poor and they can not pay the fees, so their children can not go to university even they are clever. This is not fair. If education is free, everybody have the same chance and the country will have more doctors, engineers and teachers. For example in my country many students stop study after school because of money.

On the other hand, free university is very expensive for the government. The money come from taxes, so all people must pay more tax, also people who did not go to university. In addition, some students maybe not study hard if they don't pay anything, they will waste time and repeat the courses many times.

In my opinion, university should be free for students who are poor or who have good marks. Other students can pay some money. I think this is the best way because the government can save money and also poor students can study.

To sum up, free university has advantages and disadvantages. I partly agree that it should be free, but only for some students.`,
  },
  {
    id: "t2-03",
    kind: "t2",
    prompt: T2_CITIES,
    expected_band: 5.5,
    essay: `Nowadays a large number of people leave the countryside and move to big cities. There are several reasons for this trend and it also brings some problems, which I will discuss in this essay.

The main reason why people move to cities is jobs. In the countryside there are not many jobs except farming, and farming does not pay much money. In cities there are factories, offices and shops, so people can find work with higher salary. Another reason is education and services. Cities have better schools, universities and hospitals, so many parents move to the city to give their children a better future. Young people also like the city life, because there are more shops, cinemas and things to do in the free time.

However, this movement creates many problems. First of all, cities become very crowded. There is not enough houses for everyone, so the price of renting a flat is very high and some people have to live in poor areas with bad conditions. Secondly, more people means more cars, and this causes traffic jams and air pollution, which is harmful for health. Finally, the countryside also has problems because young people leave and only old people stay there, so villages become empty and farms have no workers.

In conclusion, people move to cities mainly for jobs and better services, but this causes overcrowding, pollution and problems in rural areas. The government should create more jobs and build better schools and hospitals in the countryside to reduce this trend.`,
  },
  {
    id: "t2-04",
    kind: "t2",
    prompt: T2_REMOTE,
    expected_band: 6,
    essay: `Nowadays, a lot of companies let their staff work from home. Some people think this is good for both workers and employers, while others believe it creates more problems. In this essay I will discuss both views and give my opinion.

On the one hand, working from home saves time and money. Employees do not need to travel to the office every day, so they have more time for their family and they spend less on transport. Employers also benefit because they can rent smaller offices and hire people who live far away from the city. In addition, many people feel more relaxed at home, which can make them more productive. For example, my cousin works for a bank and she says she finishes her tasks faster at home because nobody interrupts her.

On the other hand, there are some disadvantages. Workers may feel lonely because they do not see their colleagues, and it is harder for managers to check the progress of a team. Furthermore, some employees find it difficult to separate work and private life, so they work longer hours and become tired. Not everyone has a quiet room at home either, and children or noisy neighbours can make it hard to concentrate. As a result, some workers actually get less done at home than in the office.

In conclusion, I believe that working from home has more advantages than disadvantages, but companies should set clear rules and meet their staff regularly. In my opinion, a mix of home and office work is the best solution for everyone.`,
  },
  {
    id: "t2-05",
    kind: "t2",
    prompt: T2_TOURISM,
    expected_band: 6,
    essay: `International tourism has grown very quickly in recent decades. While it brings money and jobs to many places, it also causes some serious problems. In my view, the advantages are greater than the disadvantages, as long as tourism is managed carefully.

The biggest advantage of tourism is economic. Tourists spend money in hotels, restaurants and shops, and this creates jobs for local people. In some countries, such as Thailand, tourism is one of the main sources of income. Moreover, the money from tourism can be used to improve roads, airports and other facilities which also help local residents. Tourism also helps people from different cultures to understand each other better, because visitors learn about local traditions and local people meet visitors from all over the world.

However, tourism has negative effects too. Popular places become very crowded, and prices of houses and food go up, so local people sometimes cannot afford to live in their own city. Tourists can also damage the environment, for example by leaving rubbish on beaches or in national parks. In addition, some traditional cultures change because they try to please tourists.

Although these problems are real, I believe they can be solved. Governments can limit the number of visitors to sensitive places and use tourist taxes to protect the environment. Therefore, tourism can continue to bring benefits without destroying the places people want to visit.

In conclusion, I think the advantages of international tourism outweigh its disadvantages, but only if governments control it in a responsible way.`,
  },
  {
    id: "t2-06",
    kind: "t2",
    prompt: T2_ENVIRONMENT,
    expected_band: 6.5,
    essay: `It is often argued that ordinary people have little power to protect the environment, and that real change can only come from governments and big corporations. While I accept that large organisations have a much bigger impact, I disagree that individuals can do very little.

There is no doubt that governments and companies play the most important role. Governments can pass laws that limit pollution, invest in public transport and support renewable energy, while large companies produce most of the world's emissions through their factories and supply chains. A single decision by a government, such as banning single-use plastic bags, can have a greater effect than millions of individual efforts.

Nevertheless, individuals are not powerless. Firstly, small actions add up when many people take them. If millions of people use public transport, eat less meat and save energy at home, the total reduction in emissions is significant. Secondly, consumers influence companies through what they buy. When customers choose products that are environmentally friendly, businesses are forced to change in order to stay competitive. Finally, citizens can pressure governments by voting for parties with green policies and by joining campaigns, which is how many environmental laws were introduced in the first place. In this way, individuals can affect the decisions of the organisations that have the most power.

In conclusion, although governments and large companies have the greatest responsibility, individuals can make a real difference, both directly through their daily choices and indirectly by influencing businesses and politicians. Therefore, everyone should play their part.`,
  },
  {
    id: "t2-07",
    kind: "t2",
    prompt: T2_TECH_CHILDREN,
    expected_band: 7,
    essay: `Children nowadays devote a considerable amount of their free time to smartphones, tablets and computers. Although this trend raises legitimate concerns about health and social development, I believe it is, on balance, a positive development, provided that screen time is properly supervised.

Admittedly, excessive use of digital devices can be harmful. Children who spend hours in front of a screen tend to be less physically active, which contributes to rising rates of childhood obesity. There is also evidence that late-night use disrupts sleep, affecting concentration at school. Moreover, unsupervised access to the internet can expose young people to inappropriate content or online bullying, risks that many parents are not fully aware of.

However, the benefits of technology are substantial. Digital devices give children access to an enormous range of educational resources, from language-learning apps to online encyclopaedias and video lessons, allowing them to learn at their own pace and explore subjects that interest them. Furthermore, familiarity with technology from an early age prepares them for a job market in which digital skills are essential. Even social media and online games, often criticised, can help children maintain friendships and develop teamwork and problem-solving skills.

The key, therefore, lies in how devices are used rather than whether they are used at all. When parents set clear limits, encourage a balance with outdoor activities and guide their children towards high-quality content, the advantages clearly outweigh the drawbacks.

In conclusion, while the dangers of excessive screen time should not be ignored, I consider children's use of technology to be a largely positive development, as long as it is managed responsibly.`,
  },
  {
    id: "t2-08",
    kind: "t2",
    prompt: T2_UNIVERSITY,
    expected_band: 7.5,
    essay: `Whether higher education should be funded entirely by the state is a question that divides opinion in many countries. In my view, making university free for everyone is a desirable goal in principle, but in practice a system that combines public funding with targeted support is fairer and more sustainable.

The case for free university education is compelling. Talent is distributed evenly across society, but wealth is not, and tuition fees inevitably deter capable students from low-income families, who are often reluctant to take on large debts. Removing fees would therefore widen access and allow a country to make full use of its human potential. Furthermore, graduates tend to earn more and pay more tax over their lifetimes, so public investment in their education is, to some extent, repaid to society.

Nevertheless, universal free tuition has significant drawbacks. Funding it requires substantial public spending, which must come either from higher taxes or from cuts to other services such as healthcare or primary schools, which arguably benefit a wider section of the population. Paradoxically, it can also be regressive: since students from wealthier backgrounds are still more likely to attend university, taxpayers who never studied would be subsidising the education of the relatively privileged.

For these reasons, I believe a more balanced approach is preferable. Students from disadvantaged backgrounds should study for free and receive grants for living costs, while others could pay fees through income-contingent loans that are repaid only once graduates earn above a certain threshold. Such a system protects access without placing an unreasonable burden on public finances.

In conclusion, although I sympathise with the ideal of free university for all, I only partly agree with it, as targeted support achieves the same aim of fairness more efficiently.`,
  },
  {
    id: "t2-09",
    kind: "t2",
    prompt: T2_CITIES,
    expected_band: 8,
    essay: `Across much of the developing world, rural populations are steadily draining into towns and cities. This migration is driven largely by economic opportunity and access to services, and while it fuels growth, it also places considerable strain on both urban and rural communities.

The principal cause is the gap in earning potential between the countryside and the city. Agriculture, the mainstay of rural economies, is increasingly mechanised and offers low, unpredictable incomes, whereas cities concentrate manufacturing, services and the informal economy, all of which promise steadier wages. Closely linked to this is access to public services: urban areas typically offer better schools, specialist healthcare and reliable infrastructure, so families often move in the hope of securing a better future for their children. Cultural factors also play a part, as young people in particular are drawn by the lifestyle, independence and anonymity that city life affords.

This influx, however, creates serious problems. Cities frequently grow faster than their infrastructure, resulting in housing shortages, soaring rents and the spread of informal settlements that lack sanitation and clean water. Congestion and air pollution worsen as populations swell, and competition for jobs can depress wages at the lower end of the labour market. Meanwhile, the countryside suffers a different kind of damage: as working-age residents leave, villages are left with ageing populations, farms struggle to find labour, and local schools and clinics close for lack of demand, which in turn encourages further departures.

In conclusion, people are moving to cities chiefly in search of better jobs and services, but unmanaged urbanisation leads to overcrowding and environmental decline in cities and to depopulation in rural areas. Addressing it requires investment in rural economies as much as in urban planning.`,
  },
  {
    id: "t2-10",
    kind: "t2",
    prompt: T2_ENVIRONMENT,
    expected_band: 8.5,
    essay: `It is frequently claimed that environmental protection is the preserve of governments and multinational corporations, and that the efforts of individuals amount to little more than a gesture. While it would be naive to deny that institutional action carries far greater weight, I believe this view seriously underestimates the influence that individuals exert, both directly and, more importantly, indirectly.

The argument for institutional responsibility is undeniably strong. A relatively small number of companies account for a disproportionate share of global emissions, and only governments have the authority to set binding targets, price carbon, regulate industry and fund the infrastructure, such as rail networks and renewable grids, on which a low-carbon economy depends. Against this backdrop, the decision of one household to recycle more diligently can appear almost trivial.

Yet this reasoning treats individuals solely as consumers of energy rather than as participants in a wider system. The cumulative effect of personal choices is far from negligible: shifts in diet, travel and energy use, multiplied across millions of people, translate into measurable reductions in emissions. More significantly, individual behaviour shapes the decisions of the very institutions said to matter most. Companies respond to consumer demand, as the rapid growth of plant-based foods and electric vehicles demonstrates, and governments respond to voters; virtually every major environmental law, from clean air legislation to recent climate commitments, followed sustained public pressure rather than preceding it.

Seen in this light, the supposed opposition between individual and institutional action is a false one. Governments and corporations hold the levers of large-scale change, but it is individuals, as consumers, voters and campaigners, who determine whether and how quickly those levers are pulled.

In conclusion, I disagree that individuals can achieve very little. Their direct impact may be modest, but their collective influence over markets and policy makes them indispensable to any meaningful environmental progress.`,
  },
  // ── Task 1 General ──────────────────────────────────────────────────────────────────────────
  {
    id: "t1g-01",
    kind: "t1_general",
    prompt: T1G_NEIGHBOUR,
    expected_band: 4.5,
    essay: `Dear neighbour,

My name is Ali and I am live in flat 5. I am new here. I want to tell you about the music. Every night you play music very loud and I can not sleep. I have to go work early in morning and I am very tired.

Please you can stop the music at night. Thank you very much.

Ali`,
  },
  {
    id: "t1g-02",
    kind: "t1_general",
    prompt: T1G_COURSE,
    expected_band: 5.5,
    essay: `Dear Sir or Madam,

I am writing to you about the evening course which I finished last week. I took the photography course for beginners on Tuesday evenings. I choose this course because I bought a new camera last year but I did not know how to use it properly, and my friend told me your college has good courses.

I really liked the course. The teacher, Mr Brown, was very friendly and he explain everything clearly. I also liked that we went outside to take photos in the park and the city centre, it was very interesting and I learned a lot. The other students were nice too and now I have some new friends.

However, I think the course can be better. The classroom was too small for twenty students and sometimes we could not see the computer screen. Also, two hours is not enough time for practice. Maybe you can make the lessons longer or give us more weeks.

Thank you for this course. I hope to take the next level next year.

Yours faithfully,
Maria Lopez`,
  },
  {
    id: "t1g-03",
    kind: "t1_general",
    prompt: T1G_FRIEND,
    expected_band: 6.5,
    essay: `Dear Tom,

I was so happy to hear that you're finally coming to visit my city next month! I can't wait to show you around.

You asked me when is the best time to come. I'd recommend the second half of the month, because the weather usually gets warmer then and there's also a big food festival in the main square on the last weekend. It's one of the highlights of the year, so I'm sure you'll enjoy it.

There are lots of places worth seeing. You definitely have to visit the old town with its narrow streets and colourful houses, and the castle on the hill, which has an amazing view of the whole city. If you like museums, the history museum is free on Sundays. In the evening we could go to the riverside, where there are plenty of nice cafés and restaurants.

As for accommodation, you don't need to worry. You're welcome to stay in my spare room for as long as you like. If you'd prefer a hotel, I know a few good ones near the centre and I can book one for you.

Let me know your dates as soon as possible.

Best wishes,
Anna`,
  },
  {
    id: "t1g-04",
    kind: "t1_general",
    prompt: T1G_NEIGHBOUR,
    expected_band: 7,
    essay: `Dear Mr Patel,

I hope you don't mind me writing to you. My name is Sara Klein, and I moved into flat 12, directly below yours, about two weeks ago. I've been meaning to introduce myself properly, but our paths haven't crossed yet.

I'm afraid I'm writing about a small problem. On several evenings recently, music has been playing quite loudly in your flat until well after midnight. Unfortunately, the sound carries through the ceiling, and as I start work at seven, I've found it increasingly difficult to get enough sleep. I'm sure you're not aware of how much can be heard downstairs, as the building's walls seem rather thin.

I wonder if we could find a solution that suits us both. Perhaps the music could be turned down after about 11 p.m. on weekdays, or you might consider using headphones late at night. I'd be more than happy to be flexible at weekends. Alternatively, if it's easier, please feel free to knock on my door so that we can talk it over in person.

Thank you for taking the time to read this, and I look forward to meeting you soon.

Kind regards,
Sara Klein`,
  },
  {
    id: "t1g-05",
    kind: "t1_general",
    prompt: T1G_COURSE,
    expected_band: 8,
    essay: `Dear Sir or Madam,

I am writing to share some feedback on the ten-week Introduction to Spanish course that I completed at your college last Thursday. I enrolled because my company is expanding into Latin America and I expect to travel there regularly, so I was keen to acquire at least a working knowledge of the language before my first visit.

I am pleased to say that the course exceeded my expectations. The tutor, Ms Ortega, struck an excellent balance between grammar and conversation, and her lively, well-structured lessons meant that even complete beginners were soon holding simple conversations. I particularly appreciated the role-plays based on real situations, such as checking into a hotel or ordering a meal, which gave me the confidence to use what I had learned outside the classroom.

That said, I would like to suggest a couple of improvements. Firstly, the course relied heavily on photocopied handouts, which were easy to lose; access to an online platform with the materials and audio recordings would make it much easier to revise between classes. Secondly, ten weeks felt rather short, and a follow-on intermediate course starting immediately afterwards would help students maintain their momentum.

Thank you for organising such a worthwhile course. I would certainly recommend it to colleagues and hope to enrol in the next level.

Yours faithfully,
David Chen`,
  },
  // ── Task 1 Academic ─────────────────────────────────────────────────────────────────────────
  {
    id: "t1a-01",
    kind: "t1_academic",
    prompt: T1A_ENERGY,
    expected_band: 5,
    essay: `The table shows about electricity from different sources in one country in 2000 and 2020.

In 2000, coal was 55%, natural gas was 20%, nuclear was 15%, wind and solar was 2% and hydro was 8%. In 2020, coal was 25%, natural gas was 30%, nuclear was 10%, wind and solar was 28% and hydro was 7%.

Coal went down from 55% to 25%. Natural gas went up from 20% to 30%. Nuclear went down from 15% to 10%. Wind and solar went up very much from 2% to 28%. Hydro is almost same, 8% and 7%.

I think wind and solar increased because people want clean energy and the government want to stop pollution. Coal is bad for the environment so they use less coal now.`,
  },
  {
    id: "t1a-02",
    kind: "t1_academic",
    prompt: T1A_SPENDING,
    expected_band: 6,
    essay: `The table compares how much households in three countries spent each week on housing, food, transport and leisure in 2023.

Overall, housing was the biggest expense in all three countries, and households in Country A spent the most money in general.

In Country A, people spent 320 dollars a week on housing, which is much higher than in Country B (210 dollars) and Country C (150 dollars). Country A also spent the most on leisure, with 110 dollars, while the other two countries spent less than half of this amount, 45 and 40 dollars.

For food, the figures were quite similar. Country B spent the most, 160 dollars, followed by Country A with 140 and Country C with 120. Transport was the smallest category in Country B, only 60 dollars, but in Country A and C it was 90 and 85 dollars, so they were nearly the same.

In summary, Country A had the highest spending on most categories, especially housing and leisure, but Country B spent a little more on food.`,
  },
  {
    id: "t1a-03",
    kind: "t1_academic",
    prompt: T1A_ENERGY,
    expected_band: 6.5,
    essay: `The table shows the proportion of electricity generated from five sources in a particular country in 2000 and 2020.

Overall, the country relied much less on coal in 2020 than in 2000, while wind and solar power grew dramatically to become one of the main sources of electricity.

In 2000, coal was by far the most important source, providing more than half of all electricity (55%). Natural gas was second with 20%, followed by nuclear power at 15%. Hydro and wind and solar played only a small role, at 8% and just 2% respectively.

Twenty years later, the situation had changed considerably. The share of coal had fallen by more than half to 25%, and nuclear power had also decreased slightly to 10%. In contrast, natural gas rose to 30%, making it the largest single source. The most striking change was in wind and solar energy, which increased fourteen times to 28%, overtaking coal. Hydro remained fairly stable at around 7%.

In short, the country shifted from coal towards gas and renewable energy over the period.`,
  },
  {
    id: "t1a-04",
    kind: "t1_academic",
    prompt: T1A_SPENDING,
    expected_band: 7,
    essay: `The table provides information about average weekly household expenditure on housing, food, transport and leisure in three countries in 2023.

Overall, housing accounted for the largest share of spending in every country, and households in Country A spent considerably more than those in the other two countries, particularly on housing and leisure.

Housing costs varied widely. Households in Country A paid $320 a week, roughly double the figure for Country C ($150), with Country B in between at $210. A similar pattern can be seen for leisure: Country A spent $110, more than twice as much as Country B ($45) and Country C ($40).

By contrast, spending on food was relatively consistent across the three countries, ranging from $120 in Country C to $160 in Country B, which was the only category in which Country A did not spend the most. Transport costs were also comparable in Country A ($90) and Country C ($85), whereas households in Country B spent noticeably less, at $60.

In total, a typical household in Country A spent $660 per week, compared with $475 in Country B and $395 in Country C, which highlights the considerable difference in living costs between the three countries.`,
  },
  {
    id: "t1a-05",
    kind: "t1_academic",
    prompt: T1A_ENERGY,
    expected_band: 8,
    essay: `The table compares the contribution of five energy sources to a country's electricity supply in 2000 and 2020.

The most notable feature is a marked shift away from coal towards cleaner alternatives: coal's dominance had ended by 2020, while wind and solar power rose from near insignificance to become a major source, and natural gas emerged as the single largest provider.

At the start of the period, the electricity mix was heavily dependent on coal, which generated over half of the total (55%). Natural gas and nuclear power made moderate contributions of 20% and 15% respectively, whereas hydroelectric power supplied 8% and wind and solar a mere 2%.

By 2020, coal's share had more than halved to 25%, and nuclear power had also declined, albeit more modestly, to 10%. These falls were offset by growth elsewhere. Natural gas increased by half, from 20% to 30%, overtaking coal as the leading source, while wind and solar experienced a fourteen-fold rise to 28%, giving them a larger share than coal. Hydroelectric generation, by contrast, remained virtually unchanged, slipping by just one percentage point to 7%.

In summary, over these two decades the country transformed its electricity supply from one dominated by coal to a far more balanced mix in which gas and renewables played the leading roles.`,
  },
];
