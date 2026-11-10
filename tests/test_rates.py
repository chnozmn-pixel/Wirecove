import os
import platform
import unittest
from netwatch import Rates, process_unique_id
class Tests(unittest.TestCase):
 def test_lifecycle(self):
  r=Rates(); a=(42,'app',100); b=(42,'app',200)
  self.assertEqual(r.sample(0,{a:('app',100,100)})[0]['state'],'baseline')
  row=r.sample(2,{a:('app',300,500)})[0]
  self.assertEqual((row['bytes_in_per_second'],row['bytes_out_per_second']),(100,200))
  self.assertEqual(r.sample(3,{a:('app',10,600)})[0]['state'],'counter_reset')
  self.assertEqual(r.sample(4,{a:('app',20,610)})[0]['bytes_in_per_second'],10)
  self.assertEqual(r.sample(5,{}),[])
  self.assertEqual(r.sample(6,{a:('app',99999,99999)})[0]['state'],'baseline')
  self.assertEqual(r.sample(7,{b:('app',999999,999999)})[0]['state'],'baseline')
 def test_time(self):
  r=Rates(); a=(1,'a',1); r.sample(1,{a:('app',0,0)})
  self.assertIsNone(r.sample(1,{a:('app',10,10)})[0]['bytes_in_per_second'])
 def test_identity_unavailable(self):
  r=Rates(); a=(5,'app',None)
  self.assertEqual(r.sample(1,{a:('app',10,10)})[0]['state'],'identity_unavailable')
  row=r.sample(2,{a:('app',100000,100000)})[0]
  self.assertIsNone(row['bytes_in_per_second'])
 @unittest.skipUnless(platform.system()=='Darwin','libproc requires macOS')
 def test_real_process_identity(self):
  self.assertIsInstance(process_unique_id(os.getpid()),int)
